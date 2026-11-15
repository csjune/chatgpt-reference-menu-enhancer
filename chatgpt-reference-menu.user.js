// ==UserScript==
// @name               ChatGPT Reference Menu Enhancer
// @name:ko            ChatGPT 참고 이미지 메뉴 가속
// @name:ja            ChatGPT 参照メニュー拡張
// @name:zh-CN         ChatGPT 参考菜单增强
// @name:zh-TW         ChatGPT 參考選單增強
// @name:es            Menú de referencias mejorado para ChatGPT
// @name:fr            Menu de références amélioré pour ChatGPT
// @name:de            Erweitertes Referenzmenü für ChatGPT
// @name:pt-BR         Menu de referências aprimorado para ChatGPT
// @name:ru            Улучшенное меню референсов ChatGPT
// @namespace          local.chatgpt.reference-menu
// @version            1.0.1
// @description        Adds reference-name search, cached thumbnails and larger previews to ChatGPT image reference menus.
// @description:ko     ChatGPT 이미지 참고 자료 메뉴에 이름 검색·썸네일 캐시·큰 미리보기를 추가합니다.
// @description:ja     ChatGPT の画像参照メニューに、参照名の検索、サムネイルのキャッシュ、大きなプレビューを追加します。
// @description:zh-CN  为 ChatGPT 图像参考菜单添加参考名称搜索、缩略图缓存和大图预览。
// @description:zh-TW  為 ChatGPT 圖像參考選單新增參考名稱搜尋、縮圖快取和大型預覽。
// @description:es     Añade búsqueda por nombre de referencia, miniaturas en caché y vistas previas más grandes a los menús de referencias de imágenes de ChatGPT.
// @description:fr     Ajoute une recherche par nom de référence, des miniatures en cache et des aperçus plus grands aux menus de références des images de ChatGPT.
// @description:de     Ergänzt die Bildreferenzmenüs von ChatGPT um eine Suche nach Referenznamen, zwischengespeicherte Miniaturbilder und größere Vorschauen.
// @description:pt-BR  Adiciona busca por nome de referência, miniaturas em cache e prévias maiores aos menus de referências de imagens do ChatGPT.
// @description:ru     Добавляет поиск по имени референса, кэшированные миниатюры и увеличенные предпросмотры в меню референсов изображений ChatGPT.
// @author             csjune
// @license            MIT
// @match              https://chatgpt.com/*
// @run-at             document-start
// @sandbox            raw
// @grant              none
// @noframes
// ==/UserScript==

/*
MIT License

Copyright (c) 2026 csjune

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

(function () {
  'use strict';

  const CONFIG = Object.freeze({
    catalogHours: 24,
    catalogRefreshMinutes: 30,
    resumeChats: 5,
    thumbnailDays: 30,
    maxThumbnails: 10000,
    thumbnailSize: 48,
    concurrentDownloads: 6,
    backgroundDownloads: 2,
    catalogVerificationMinutes: 5,
    selectedImageTimeoutSeconds: 30,
    requestTimeoutSeconds: 30,
    storageTimeoutSeconds: 5,
    storageReadRetryMs: 1000,
    storageReopenSeconds: 15,
    storageReopenMaxSeconds: 300,
    cacheAttempts: 3,
    hoverDelayMs: 180,
    hoverMaxWidth: 480,
    hoverMaxHeight: 340,
    hoverCacheEntries: 12,
    hoverCacheBytes: 32 * 1024 * 1024,
    hoverDiskEntries: 1000,
    hoverDiskBytes: 512 * 1024 * 1024,
    accessWriteDelayMs: 2000,
    accessWriteBatchSize: 128,
    accessWriteIntervalMs: 60000,
  });
  const HOUR = 60 * 60 * 1000;
  const THUMBNAIL_LIFETIME = CONFIG.thumbnailDays * 24 * HOUR;
  const LIST_PATH = '/backend-api/files/library/reference-images';

  // Keep translations inline so the installed userscript has no external code dependency.
  const UI_MESSAGES = Object.freeze(Object.fromEntries(Object.entries({
  "en": {
    "selectingReference": "Processing reference selection",
    "refreshingRestart": "Refreshing list · Click to cancel and restart from the first page",
    "refreshInBackground": "Refresh the latest reference list in the background",
    "connectingReferences": "Connecting reference list",
    "counterBreakdown": "{label} success/failure/total",
    "cacheComplete": "{label} complete",
    "searchResults": "Search results",
    "referencesUnknown": "References found / total unknown",
    "referencesTotal": "Total references",
    "thumbnailCache": "Thumbnail cache",
    "cachePending": "Cache pending",
    "previewCache": "Large preview cache",
    "catalogFailed": "List request failed",
    "catalogRefreshing": "Refreshing list",
    "catalogLoading": "Loading list",
    "caching": "Caching",
    "checkingCache": "Checking cache",
    "cacheWriteError": "Cache write error",
    "cacheError": "Cache error",
    "catalogPages": "List: {count} pages",
    "discovered": "Found: {count}",
    "pending": "Pending: {count}",
    "previewsDiscovered": "Previews found: {count}",
    "previewsPending": "Previews pending: {count}",
    "previewsPaused": "Preview caching paused · Unchecked items remain pending",
    "previewTooLarge": "The large preview exceeds the cache size limit",
    "verifyingReference": "Checking selected reference…",
    "referenceNotFound": "Saved reference not found. Refresh the list.",
    "verifyFailedRetry": "Could not verify the selected reference. Try again.",
    "waitingCatalog": "Waiting for the full list to recheck the reference connection.",
    "sendingRegeneration": "Sending regeneration request…",
    "regenerationSent": "Regeneration request sent.",
    "regenerationUnavailable": "Could not start regeneration on this page. Check and try again.",
    "regenerationFailed": "Regeneration failed. The request was not automatically resent.",
    "verifyTimeout": "Reference verification timed out. Try again.",
    "verifyFailed": "Could not verify the reference.",
    "previewLoading": "Loading large preview…",
    "previewFailed": "Could not load the preview. Hover over the item again.",
    "searchLabel": "Search reference names",
    "refreshLabel": "Refresh reference list"
  },
  "ko": {
    "selectingReference": "참조 선택 처리 중",
    "refreshingRestart": "목록 갱신 중 · 클릭하면 취소하고 처음부터 다시 조회",
    "refreshInBackground": "최신 참조 목록을 백그라운드에서 갱신",
    "connectingReferences": "참조 목록 연결 확인 중",
    "counterBreakdown": "{label} 성공/실패/전체",
    "cacheComplete": "{label} 완료",
    "searchResults": "검색 결과",
    "referencesUnknown": "확인된 참조 / 전체 미확정",
    "referencesTotal": "전체 참조",
    "thumbnailCache": "썸네일 캐시",
    "cachePending": "캐시 대기",
    "previewCache": "큰 미리보기 캐시",
    "catalogFailed": "목록 조회 실패",
    "catalogRefreshing": "목록 갱신 중",
    "catalogLoading": "목록 조회 중",
    "caching": "캐싱 중",
    "checkingCache": "캐시 확인 중",
    "cacheWriteError": "캐시 저장 오류",
    "cacheError": "캐시 오류",
    "catalogPages": "목록 {count}페이지",
    "discovered": "확인 {count}",
    "pending": "대기 {count}",
    "previewsDiscovered": "큰 미리보기 확인 {count}",
    "previewsPending": "큰 미리보기 대기 {count}",
    "previewsPaused": "큰 미리보기 캐싱 중단 · 미확인 항목은 대기 유지",
    "previewTooLarge": "큰 미리보기의 용량이 너무 커",
    "verifyingReference": "선택한 참조 확인 중…",
    "referenceNotFound": "저장된 참조를 찾을 수 없어. 목록을 새로고침해 줘.",
    "verifyFailedRetry": "선택한 참조를 확인하지 못했어. 다시 시도해 줘.",
    "waitingCatalog": "참조 연결을 다시 확인해야 해서 전체 목록 조회를 기다려.",
    "sendingRegeneration": "재생성 요청 보내는 중…",
    "regenerationSent": "재생성 요청을 보냈어.",
    "regenerationUnavailable": "현재 화면에서 재생성을 시작하지 못했어. 다시 확인해 줘.",
    "regenerationFailed": "재생성 처리에 실패했어. 자동 재전송은 하지 않았어.",
    "verifyTimeout": "참조 확인 시간이 초과됐어. 다시 시도해 줘.",
    "verifyFailed": "참조 확인에 실패했어.",
    "previewLoading": "큰 이미지 불러오는 중…",
    "previewFailed": "큰 이미지를 불러오지 못했어. 다시 커서를 올려 줘.",
    "searchLabel": "참조 이름 검색",
    "refreshLabel": "참조 목록 새로고침"
  },
  "ja": {
    "selectingReference": "参照の選択を処理中",
    "refreshingRestart": "一覧を更新中 · クリックするとキャンセルし、最初のページから再取得します",
    "refreshInBackground": "最新の参照一覧をバックグラウンドで取得",
    "connectingReferences": "参照一覧に接続中",
    "counterBreakdown": "{label} 成功/失敗/合計",
    "cacheComplete": "{label} 完了",
    "searchResults": "検索結果",
    "referencesUnknown": "確認済みの参照 / 合計未確定",
    "referencesTotal": "参照の総数",
    "thumbnailCache": "サムネイルキャッシュ",
    "cachePending": "キャッシュ待機中",
    "previewCache": "大きなプレビューのキャッシュ",
    "catalogFailed": "一覧の取得に失敗",
    "catalogRefreshing": "一覧を更新中",
    "catalogLoading": "一覧を取得中",
    "caching": "キャッシュ中",
    "checkingCache": "キャッシュを確認中",
    "cacheWriteError": "キャッシュの書き込みエラー",
    "cacheError": "キャッシュエラー",
    "catalogPages": "一覧: {count} ページ",
    "discovered": "確認済み: {count}",
    "pending": "待機中: {count}",
    "previewsDiscovered": "確認済みプレビュー: {count}",
    "previewsPending": "待機中プレビュー: {count}",
    "previewsPaused": "プレビューのキャッシュを一時停止 · 未確認の項目は待機状態を維持します",
    "previewTooLarge": "大きなプレビューがキャッシュの容量制限を超えています",
    "verifyingReference": "選択した参照を確認中…",
    "referenceNotFound": "保存済みの参照が見つかりません。一覧を更新してください。",
    "verifyFailedRetry": "選択した参照を確認できませんでした。もう一度お試しください。",
    "waitingCatalog": "参照の接続を再確認するため、一覧全体の取得を待っています。",
    "sendingRegeneration": "再生成リクエストを送信中…",
    "regenerationSent": "再生成リクエストを送信しました。",
    "regenerationUnavailable": "このページでは再生成を開始できませんでした。確認して、もう一度お試しください。",
    "regenerationFailed": "再生成に失敗しました。リクエストは自動再送していません。",
    "verifyTimeout": "参照の確認がタイムアウトしました。もう一度お試しください。",
    "verifyFailed": "参照を確認できませんでした。",
    "previewLoading": "大きなプレビューを読み込み中…",
    "previewFailed": "プレビューを読み込めませんでした。項目にもう一度カーソルを合わせてください。",
    "searchLabel": "参照名を検索",
    "refreshLabel": "参照一覧を更新"
  },
  "zh-CN": {
    "selectingReference": "正在处理参考选择",
    "refreshingRestart": "正在刷新列表 · 点击可取消并从第一页重新获取",
    "refreshInBackground": "在后台刷新最新参考列表",
    "connectingReferences": "正在连接参考列表",
    "counterBreakdown": "{label} 成功/失败/总计",
    "cacheComplete": "{label} 已完成",
    "searchResults": "搜索结果",
    "referencesUnknown": "已确认参考 / 总数未确定",
    "referencesTotal": "参考总数",
    "thumbnailCache": "缩略图缓存",
    "cachePending": "等待缓存",
    "previewCache": "大图预览缓存",
    "catalogFailed": "列表请求失败",
    "catalogRefreshing": "正在刷新列表",
    "catalogLoading": "正在获取列表",
    "caching": "正在缓存",
    "checkingCache": "正在检查缓存",
    "cacheWriteError": "缓存写入错误",
    "cacheError": "缓存错误",
    "catalogPages": "列表：{count} 页",
    "discovered": "已确认：{count}",
    "pending": "等待中：{count}",
    "previewsDiscovered": "已确认预览：{count}",
    "previewsPending": "等待预览：{count}",
    "previewsPaused": "预览缓存已暂停 · 未检查的项目保持等待状态",
    "previewTooLarge": "大图预览超出缓存大小限制",
    "verifyingReference": "正在检查所选参考…",
    "referenceNotFound": "找不到已保存的参考。请刷新列表。",
    "verifyFailedRetry": "无法验证所选参考。请重试。",
    "waitingCatalog": "正在等待获取完整列表，以重新检查参考连接。",
    "sendingRegeneration": "正在发送重新生成请求…",
    "regenerationSent": "已发送重新生成请求。",
    "regenerationUnavailable": "无法在当前页面开始重新生成。请检查后重试。",
    "regenerationFailed": "重新生成失败。请求未自动重发。",
    "verifyTimeout": "参考验证超时。请重试。",
    "verifyFailed": "无法验证参考。",
    "previewLoading": "正在加载大图预览…",
    "previewFailed": "无法加载预览。请将鼠标再次移到该项目上。",
    "searchLabel": "搜索参考名称",
    "refreshLabel": "刷新参考列表"
  },
  "zh-TW": {
    "selectingReference": "正在處理參考選取",
    "refreshingRestart": "正在重新整理清單 · 點擊可取消並從第一頁重新取得",
    "refreshInBackground": "在背景更新最新的參考清單",
    "connectingReferences": "正在連接參考清單",
    "counterBreakdown": "{label} 成功/失敗/總計",
    "cacheComplete": "{label} 已完成",
    "searchResults": "搜尋結果",
    "referencesUnknown": "已確認參考 / 總數未確定",
    "referencesTotal": "參考總數",
    "thumbnailCache": "縮圖快取",
    "cachePending": "等待快取",
    "previewCache": "大型預覽快取",
    "catalogFailed": "清單請求失敗",
    "catalogRefreshing": "正在更新清單",
    "catalogLoading": "正在取得清單",
    "caching": "正在快取",
    "checkingCache": "正在檢查快取",
    "cacheWriteError": "快取寫入錯誤",
    "cacheError": "快取錯誤",
    "catalogPages": "清單：{count} 頁",
    "discovered": "已確認：{count}",
    "pending": "等待中：{count}",
    "previewsDiscovered": "已確認預覽：{count}",
    "previewsPending": "等待預覽：{count}",
    "previewsPaused": "預覽快取已暫停 · 未檢查的項目維持等待狀態",
    "previewTooLarge": "大型預覽超出快取大小限制",
    "verifyingReference": "正在檢查所選參考…",
    "referenceNotFound": "找不到已儲存的參考。請更新清單。",
    "verifyFailedRetry": "無法驗證所選參考。請再試一次。",
    "waitingCatalog": "正在等待取得完整清單，以重新檢查參考連接。",
    "sendingRegeneration": "正在傳送重新產生請求…",
    "regenerationSent": "已傳送重新產生請求。",
    "regenerationUnavailable": "無法在目前頁面開始重新產生。請檢查後再試一次。",
    "regenerationFailed": "重新產生失敗。請求未自動重送。",
    "verifyTimeout": "參考驗證逾時。請再試一次。",
    "verifyFailed": "無法驗證參考。",
    "previewLoading": "正在載入大型預覽…",
    "previewFailed": "無法載入預覽。請將游標再次移至該項目上。",
    "searchLabel": "搜尋參考名稱",
    "refreshLabel": "更新參考清單"
  },
  "es": {
    "selectingReference": "Procesando la selección de referencia",
    "refreshingRestart": "Actualizando la lista · Haz clic para cancelar y reiniciar desde la primera página",
    "refreshInBackground": "Actualizar la lista de referencias en segundo plano",
    "connectingReferences": "Conectando la lista de referencias",
    "counterBreakdown": "{label}: éxitos/fallos/total",
    "cacheComplete": "{label}: completo",
    "searchResults": "Resultados de búsqueda",
    "referencesUnknown": "Referencias encontradas / total desconocido",
    "referencesTotal": "Total de referencias",
    "thumbnailCache": "Caché de miniaturas",
    "cachePending": "Pendientes de caché",
    "previewCache": "Caché de vistas previas grandes",
    "catalogFailed": "Error al solicitar la lista",
    "catalogRefreshing": "Actualizando la lista",
    "catalogLoading": "Cargando la lista",
    "caching": "Guardando en caché",
    "checkingCache": "Comprobando la caché",
    "cacheWriteError": "Error de escritura en caché",
    "cacheError": "Error de caché",
    "catalogPages": "Lista: {count} páginas",
    "discovered": "Encontradas: {count}",
    "pending": "Pendientes: {count}",
    "previewsDiscovered": "Vistas previas encontradas: {count}",
    "previewsPending": "Vistas previas pendientes: {count}",
    "previewsPaused": "Caché de vistas previas en pausa · Los elementos sin comprobar siguen pendientes",
    "previewTooLarge": "La vista previa grande supera el límite de tamaño de la caché",
    "verifyingReference": "Comprobando la referencia seleccionada…",
    "referenceNotFound": "No se encontró la referencia guardada. Actualiza la lista.",
    "verifyFailedRetry": "No se pudo verificar la referencia seleccionada. Inténtalo de nuevo.",
    "waitingCatalog": "Esperando la lista completa para volver a comprobar la conexión de la referencia.",
    "sendingRegeneration": "Enviando la solicitud de regeneración…",
    "regenerationSent": "Solicitud de regeneración enviada.",
    "regenerationUnavailable": "No se pudo iniciar la regeneración en esta página. Compruébalo e inténtalo de nuevo.",
    "regenerationFailed": "La regeneración falló. La solicitud no se volvió a enviar automáticamente.",
    "verifyTimeout": "Se agotó el tiempo de verificación de la referencia. Inténtalo de nuevo.",
    "verifyFailed": "No se pudo verificar la referencia.",
    "previewLoading": "Cargando la vista previa grande…",
    "previewFailed": "No se pudo cargar la vista previa. Vuelve a colocar el cursor sobre el elemento.",
    "searchLabel": "Buscar nombres de referencias",
    "refreshLabel": "Actualizar la lista de referencias"
  },
  "fr": {
    "selectingReference": "Traitement de la sélection de référence",
    "refreshingRestart": "Actualisation de la liste · Cliquer pour annuler et reprendre à la première page",
    "refreshInBackground": "Actualiser la liste des références en arrière-plan",
    "connectingReferences": "Connexion à la liste des références",
    "counterBreakdown": "{label} : réussites/échecs/total",
    "cacheComplete": "{label} terminé",
    "searchResults": "Résultats de recherche",
    "referencesUnknown": "Références trouvées / total inconnu",
    "referencesTotal": "Nombre total de références",
    "thumbnailCache": "Cache des miniatures",
    "cachePending": "Éléments en attente de mise en cache",
    "previewCache": "Cache des grands aperçus",
    "catalogFailed": "Échec de la requête de liste",
    "catalogRefreshing": "Actualisation de la liste",
    "catalogLoading": "Chargement de la liste",
    "caching": "Mise en cache",
    "checkingCache": "Vérification du cache",
    "cacheWriteError": "Erreur d’écriture dans le cache",
    "cacheError": "Erreur de cache",
    "catalogPages": "Liste : {count} pages",
    "discovered": "Références trouvées : {count}",
    "pending": "En attente : {count}",
    "previewsDiscovered": "Aperçus trouvés : {count}",
    "previewsPending": "Aperçus en attente : {count}",
    "previewsPaused": "Mise en cache des aperçus suspendue · Les éléments non vérifiés restent en attente",
    "previewTooLarge": "Le grand aperçu dépasse la limite de taille du cache",
    "verifyingReference": "Vérification de la référence sélectionnée…",
    "referenceNotFound": "Référence enregistrée introuvable. Actualisez la liste.",
    "verifyFailedRetry": "Impossible de vérifier la référence sélectionnée. Réessayez.",
    "waitingCatalog": "En attente de la liste complète pour revérifier la correspondance de la référence.",
    "sendingRegeneration": "Envoi de la demande de régénération…",
    "regenerationSent": "Demande de régénération envoyée.",
    "regenerationUnavailable": "Impossible de lancer la régénération sur cette page. Vérifiez puis réessayez.",
    "regenerationFailed": "La régénération a échoué. La demande n’a pas été renvoyée automatiquement.",
    "verifyTimeout": "Le délai de vérification de la référence a expiré. Réessayez.",
    "verifyFailed": "Impossible de vérifier la référence.",
    "previewLoading": "Chargement du grand aperçu…",
    "previewFailed": "Impossible de charger l’aperçu. Survolez de nouveau l’élément.",
    "searchLabel": "Rechercher des noms de références",
    "refreshLabel": "Actualiser la liste des références"
  },
  "de": {
    "selectingReference": "Referenzauswahl wird verarbeitet",
    "refreshingRestart": "Liste wird aktualisiert · Zum Abbrechen und Neustarten ab der ersten Seite klicken",
    "refreshInBackground": "Aktuelle Referenzliste im Hintergrund abrufen",
    "connectingReferences": "Verbindung zur Referenzliste wird hergestellt",
    "counterBreakdown": "{label}: erfolgreich/fehlgeschlagen/gesamt",
    "cacheComplete": "{label} vollständig",
    "searchResults": "Suchergebnisse",
    "referencesUnknown": "Gefundene Referenzen / Gesamtzahl unbekannt",
    "referencesTotal": "Referenzen insgesamt",
    "thumbnailCache": "Miniaturbild-Cache",
    "cachePending": "Ausstehende Cache-Einträge",
    "previewCache": "Cache für große Vorschauen",
    "catalogFailed": "Listenanfrage fehlgeschlagen",
    "catalogRefreshing": "Liste wird aktualisiert",
    "catalogLoading": "Liste wird geladen",
    "caching": "Zwischenspeichern",
    "checkingCache": "Cache wird geprüft",
    "cacheWriteError": "Fehler beim Schreiben in den Cache",
    "cacheError": "Cache-Fehler",
    "catalogPages": "Liste: {count} Seiten",
    "discovered": "Gefunden: {count}",
    "pending": "Ausstehend: {count}",
    "previewsDiscovered": "Vorschauen gefunden: {count}",
    "previewsPending": "Vorschauen ausstehend: {count}",
    "previewsPaused": "Vorschau-Zwischenspeicherung angehalten · Ungeprüfte Einträge bleiben ausstehend",
    "previewTooLarge": "Die große Vorschau überschreitet die Größenbegrenzung des Caches",
    "verifyingReference": "Ausgewählte Referenz wird geprüft…",
    "referenceNotFound": "Gespeicherte Referenz nicht gefunden. Aktualisiere die Liste.",
    "verifyFailedRetry": "Die ausgewählte Referenz konnte nicht geprüft werden. Versuche es erneut.",
    "waitingCatalog": "Warten auf die vollständige Liste, um die Referenzzuordnung erneut zu prüfen.",
    "sendingRegeneration": "Anfrage zur erneuten Generierung wird gesendet…",
    "regenerationSent": "Anfrage zur erneuten Generierung gesendet.",
    "regenerationUnavailable": "Die erneute Generierung konnte auf dieser Seite nicht gestartet werden. Prüfe die Seite und versuche es erneut.",
    "regenerationFailed": "Die erneute Generierung ist fehlgeschlagen. Die Anfrage wurde nicht automatisch erneut gesendet.",
    "verifyTimeout": "Zeitüberschreitung bei der Referenzprüfung. Versuche es erneut.",
    "verifyFailed": "Die Referenz konnte nicht geprüft werden.",
    "previewLoading": "Große Vorschau wird geladen…",
    "previewFailed": "Die Vorschau konnte nicht geladen werden. Bewege den Mauszeiger erneut auf den Eintrag.",
    "searchLabel": "Referenznamen suchen",
    "refreshLabel": "Referenzliste aktualisieren"
  },
  "pt-BR": {
    "selectingReference": "Processando a seleção da referência",
    "refreshingRestart": "Atualizando a lista · Clique para cancelar e reiniciar da primeira página",
    "refreshInBackground": "Atualizar a lista de referências em segundo plano",
    "connectingReferences": "Conectando a lista de referências",
    "counterBreakdown": "{label}: sucessos/falhas/total",
    "cacheComplete": "{label} concluído",
    "searchResults": "Resultados da busca",
    "referencesUnknown": "Referências encontradas / total desconhecido",
    "referencesTotal": "Total de referências",
    "thumbnailCache": "Cache de miniaturas",
    "cachePending": "Itens pendentes no cache",
    "previewCache": "Cache de prévias maiores",
    "catalogFailed": "Falha na solicitação da lista",
    "catalogRefreshing": "Atualizando a lista",
    "catalogLoading": "Carregando a lista",
    "caching": "Armazenando em cache",
    "checkingCache": "Verificando o cache",
    "cacheWriteError": "Erro de gravação no cache",
    "cacheError": "Erro no cache",
    "catalogPages": "Lista: {count} páginas",
    "discovered": "Encontradas: {count}",
    "pending": "Pendentes: {count}",
    "previewsDiscovered": "Prévias encontradas: {count}",
    "previewsPending": "Prévias pendentes: {count}",
    "previewsPaused": "Armazenamento de prévias pausado · Itens não verificados continuam pendentes",
    "previewTooLarge": "A prévia maior excede o limite de tamanho do cache",
    "verifyingReference": "Verificando a referência selecionada…",
    "referenceNotFound": "Referência salva não encontrada. Atualize a lista.",
    "verifyFailedRetry": "Não foi possível verificar a referência selecionada. Tente novamente.",
    "waitingCatalog": "Aguardando a lista completa para verificar novamente a correspondência da referência.",
    "sendingRegeneration": "Enviando solicitação de regeneração…",
    "regenerationSent": "Solicitação de regeneração enviada.",
    "regenerationUnavailable": "Não foi possível iniciar a regeneração nesta página. Confira e tente novamente.",
    "regenerationFailed": "A regeneração falhou. A solicitação não foi reenviada automaticamente.",
    "verifyTimeout": "O tempo limite da verificação da referência foi atingido. Tente novamente.",
    "verifyFailed": "Não foi possível verificar a referência.",
    "previewLoading": "Carregando a prévia maior…",
    "previewFailed": "Não foi possível carregar a prévia. Passe o cursor sobre o item novamente.",
    "searchLabel": "Buscar nomes de referências",
    "refreshLabel": "Atualizar a lista de referências"
  },
  "ru": {
    "selectingReference": "Обработка выбора референса",
    "refreshingRestart": "Обновление списка · Нажмите, чтобы отменить и начать с первой страницы",
    "refreshInBackground": "Обновить список референсов в фоновом режиме",
    "connectingReferences": "Подключение списка референсов",
    "counterBreakdown": "{label}: успешно/ошибки/всего",
    "cacheComplete": "{label}: готово",
    "searchResults": "Результаты поиска",
    "referencesUnknown": "Найденные референсы / общее число неизвестно",
    "referencesTotal": "Всего референсов",
    "thumbnailCache": "Кэш миниатюр",
    "cachePending": "Ожидают кэширования",
    "previewCache": "Кэш увеличенных предпросмотров",
    "catalogFailed": "Не удалось запросить список",
    "catalogRefreshing": "Обновление списка",
    "catalogLoading": "Загрузка списка",
    "caching": "Кэширование",
    "checkingCache": "Проверка кэша",
    "cacheWriteError": "Ошибка записи в кэш",
    "cacheError": "Ошибка кэша",
    "catalogPages": "Список: {count} стр.",
    "discovered": "Найдено: {count}",
    "pending": "Ожидают: {count}",
    "previewsDiscovered": "Найдено предпросмотров: {count}",
    "previewsPending": "Ожидают предпросмотры: {count}",
    "previewsPaused": "Кэширование предпросмотров приостановлено · Непроверенные элементы остаются в ожидании",
    "previewTooLarge": "Увеличенный предпросмотр превышает ограничение размера кэша",
    "verifyingReference": "Проверка выбранного референса…",
    "referenceNotFound": "Сохранённый референс не найден. Обновите список.",
    "verifyFailedRetry": "Не удалось проверить выбранный референс. Попробуйте ещё раз.",
    "waitingCatalog": "Ожидание полного списка для повторной проверки привязки референса.",
    "sendingRegeneration": "Отправка запроса на повторную генерацию…",
    "regenerationSent": "Запрос на повторную генерацию отправлен.",
    "regenerationUnavailable": "Не удалось запустить повторную генерацию на этой странице. Проверьте и попробуйте ещё раз.",
    "regenerationFailed": "Повторная генерация не удалась. Запрос не был отправлен повторно автоматически.",
    "verifyTimeout": "Время проверки референса истекло. Попробуйте ещё раз.",
    "verifyFailed": "Не удалось проверить референс.",
    "previewLoading": "Загрузка увеличенного предпросмотра…",
    "previewFailed": "Не удалось загрузить предпросмотр. Снова наведите указатель на элемент.",
    "searchLabel": "Поиск по именам референсов",
    "refreshLabel": "Обновить список референсов"
  }
}).map(([locale, messages]) => [locale, Object.freeze(messages)])));

  function resolveUiLocale(preferences = []) {
    for (const candidate of Array.isArray(preferences) ? preferences : [preferences]) {
      if (typeof candidate !== 'string') continue;
      const tag = candidate.trim().replace(/_/g, '-').toLowerCase();
      const base = tag.split('-')[0];
      if (base === 'zh') {
        const traditional = /(?:^|-)hant(?:-|$)/.test(tag) ||
          (!/(?:^|-)hans(?:-|$)/.test(tag) && /(?:^|-)(tw|hk|mo)(?:-|$)/.test(tag));
        return traditional ? 'zh-TW' : 'zh-CN';
      }
      if (base === 'pt') return 'pt-BR';
      if (Object.hasOwn(UI_MESSAGES, base)) return base;
    }
    return 'en';
  }

  function uiLocale() {
    const page = typeof document === 'object' ? document.documentElement?.lang?.trim() : '';
    if (page) return resolveUiLocale(page);
    return resolveUiLocale(typeof navigator === 'object' ? navigator.languages?.length ? navigator.languages : navigator.language : []);
  }

  function translateUi(key, values = {}, locale = uiLocale()) {
    const message = UI_MESSAGES[resolveUiLocale(locale)]?.[key] ?? UI_MESSAGES.en[key] ?? key;
    return message.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  }

  function localizedNotice(icon, key, busy = false, error = false) {
    return { ...referenceNotice(icon, translateUi(key), busy, error), messageKey: key };
  }

  function localizedUiError(key) {
    return Object.assign(new Error(translateUi(key)), { uiMessageKey: key });
  }

  function normalize(text) {
    return String(text || '').normalize('NFKC').toLocaleLowerCase();
  }

  function matchesWords(normalized, words) { return words.every(word => normalized.includes(word)); }
  function matchesSearch(name, query) { return matchesWords(normalize(name), searchWords(query)); }

  function searchWords(query) { return normalize(query).trim().split(/\s+/).filter(Boolean); }

  class ReferenceIndex {
    constructor() { this.byId = new Map(); this.byName = new Map(); this.byFile = new Map(); this.version = 0; }
    clear() { this.byId.clear(); this.byName.clear(); this.byFile.clear(); this.version++; }
    files(item) { return new Set([item.asset_pointer, item.thumbnail_asset_pointer].map(fileKey).filter(Boolean)); }
    unlink(item) {
      for (const [map, key] of [[this.byName, item.entity_name], ...[...this.files(item)].map(file => [this.byFile, file])]) {
        const next = map.get(key)?.filter(ref => ref.id !== item.id);
        if (next?.length) map.set(key, next); else map.delete(key);
      }
      this.byId.delete(item.id);
    }
    apply(items, complete = false) {
      const names = new Set(), ids = new Set();
      let changed = 0;
      for (const item of items) {
        const old = this.byId.get(item.id);
        if (old && Object.keys(item).length === Object.keys(old).length && Object.keys(item).every(key => item[key] === old[key])) continue;
        if (old) { names.add(old.entity_name); this.unlink(old); }
        names.add(item.entity_name);
        ids.add(item.id);
        this.byId.set(item.id, item);
        for (const [map, key] of [[this.byName, item.entity_name], ...[...this.files(item)].map(file => [this.byFile, file])]) {
          const bucket = map.get(key) || [];
          bucket.push(item); map.set(key, bucket);
        }
        changed++;
      }
      if (complete) {
        const currentIds = new Set(items.map(item => item.id));
        for (const item of this.byId.values()) if (!currentIds.has(item.id)) {
          names.add(item.entity_name); ids.add(item.id); this.unlink(item); changed++;
        }
      }
      if (changed) this.version++;
      return { names, ids, changed };
    }
  }

  const FILE_KEY_PATTERN = /(?<![a-zA-Z0-9])file[_-][a-zA-Z0-9_-]+/g;

  function fileKey(value) {
    return String(value || '').match(/(?<![a-zA-Z0-9])file[_-][a-zA-Z0-9_-]+/)?.[0] || null;
  }

  function pointerFileHex(value) {
    const match = String(value || '').match(/^file[_-]([0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i);
    return match ? match[1].replace(/-/g, '').toLowerCase() : null;
  }

  function contentKey(url) {
    for (const key of ['id', 'file_id', 'asset_pointer', 'sediment_id']) {
      const found = fileKey(url.searchParams.get(key));
      if (found) return found;
    }
    return null;
  }

  function scopeKey(userId, accountId) {
    if (!userId || !accountId) return null;
    return JSON.stringify([userId, accountId]);
  }

  function referenceOwner(id) {
    return typeof id === 'string' ? id.match(/^(AccountUserId_[A-Za-z0-9_-]+)~/)?.[1] || null : null;
  }

  function scopeOwner(scope) {
    try { return scope ? JSON.parse(scope)[0] || null : null; }
    catch { return null; }
  }

  function verifiedOwner(items) {
    if (!Array.isArray(items) || !items.length) return null;
    const owner = referenceOwner(items[0]?.id);
    return owner && items.every(item => referenceOwner(item?.id) === owner) ? owner : null;
  }

  function cleanReference(item) {
    if (!item || typeof item.id !== 'string' || typeof item.entity_name !== 'string') return null;
    if (!item.asset_pointer && !item.thumbnail_asset_pointer) return null;
    return {
      id: item.id,
      entity_name: item.entity_name,
      entity_type: item.entity_type,
      entity_description: item.entity_description || '',
      library_file_id: item.library_file_id ?? null,
      source_conversation_id: item.source_conversation_id ?? null,
      source_message_id: item.source_message_id ?? null,
      image_index: item.image_index ?? null,
      asset_pointer: item.asset_pointer ?? null,
      thumbnail_asset_pointer: item.thumbnail_asset_pointer ?? null,
      // Signed URLs expire independently of the catalog. Resolve stable pointers normally.
      content_url: null,
      thumbnail_url: null,
    };
  }

  function fresh(record, lifetime, now = Date.now()) {
    return Boolean(record && record.savedAt <= now && now - record.savedAt < lifetime);
  }

  function referenceFile(reference) {
    return fileKey(reference?.thumbnail_asset_pointer) || fileKey(reference?.asset_pointer);
  }

  function validThumbnail(record) {
    return typeof record?.dataUrl === 'string' && record.dataUrl.length <= 32768 &&
      /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(record.dataUrl);
  }

  function usableThumbnail(record) { return fresh(record, THUMBNAIL_LIFETIME) && validThumbnail(record); }

  function catalogBody(record) {
    return { items: record.pages.flatMap(page => page.items), next_cursor: null };
  }

  function createCatalogSnapshot({ scope, account, identity = null, record, items }) {
    const byId = new Map(), byName = new Map();
    for (const item of items) {
      byId.set(item.id, item);
      const bucket = byName.get(item.entity_name);
      if (bucket) bucket.push(item);
      else byName.set(item.entity_name, [item]);
    }
    return { scope, account, identity, record, byId, byName };
  }

  function detachedDownload(fetcher, input, init) {
    return signal => fetcher(input, { ...init, signal });
  }

  const OPENAI_CDN_HOST = /(^|\.)(oaiusercontent\.com|openaiusercontent\.com)$/i;
  const OPENAI_SAS_FILE_PATH = /(?:^|\/)files\/(?:[0-9a-f]+_)?([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{32})(?=\/|$)/gi;

  function thumbnailMatchesReference(url, reference) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      const pointers = [reference?.asset_pointer, reference?.thumbnail_asset_pointer].filter(Boolean);
      const expectedFiles = new Set(pointers.map(fileKey).filter(Boolean));
      if (!expectedFiles.size) return false;
      const paramFile = contentKey(parsed);
      if (paramFile) return expectedFiles.has(paramFile);
      const decodedPath = decodeURIComponent(parsed.pathname);
      const pathFiles = decodedPath.match(FILE_KEY_PATTERN) || [];
      if (pathFiles.length) return pathFiles.length === 1 && expectedFiles.has(pathFiles[0]);
      if (OPENAI_CDN_HOST.test(parsed.hostname)) {
        const sasMatches = [...decodedPath.matchAll(OPENAI_SAS_FILE_PATH)];
        if (sasMatches.length !== 1) return false;
        const expectedHexes = new Set([...expectedFiles].map(pointerFileHex).filter(Boolean));
        return expectedHexes.has(sasMatches[0][1].replace(/-/g, '').toLowerCase());
      }
      return false;
    } catch { return false; }
  }

  function menuAvatarRequest(url, method) {
    if (method !== 'GET') return null;
    if (url.pathname === '/backend-api/estuary/content') {
      const file = contentKey(url);
      return file ? { file, kind: 'image' } : null;
    }
    if (url.searchParams.get('inline') === 'true' && url.searchParams.get('download_intent') === 'false') {
      const match = url.pathname.match(/^\/backend-api\/files\/download\/([^/]+)$/);
      if (!match) return null;
      try {
        const file = fileKey(decodeURIComponent(match[1]));
        return file ? { file, kind: 'metadata' } : null;
      } catch { return null; }
    }
    return null;
  }

  const TRANSIENT_REQUEST_HEADERS = [
    'x-client-request-id', 'x-request-id', 'cf-ray', 'traceparent', 'tracestate', 'baggage',
    'accept', 'range', 'if-none-match', 'if-modified-since', 'if-match', 'if-range', 'if-unmodified-since',
    'content-type', 'content-length', 'content-encoding',
  ];

  function cleanRequestHeaders(headers) {
    const clean = new Headers(headers);
    for (const name of TRANSIENT_REQUEST_HEADERS) clean.delete(name);
    return clean;
  }

  function referenceTransport(fetcher, input, init, origin) {
    const source = input instanceof Request ? input : null;
    let headers = cleanRequestHeaders(source?.headers);
    cleanRequestHeaders(init?.headers).forEach((value, key) => headers.set(key, value));
    // Kept only in this document, just like the app's ordinary request headers.
    // Never persist authentication, signed content URLs or request traces.
    const get = (url, signal) => fetcher(new Request(url, source || { credentials: 'include' }), {
      ...init, headers: new Headers(headers), method: 'GET', body: undefined, signal,
    });
    return {
      // A rotated token replaces only Authorization; the list request's other headers stay as they were.
      setAuthorization: value => { if (value) headers.set('Authorization', value); },
      verify: (id, signal) => get(new URL(`${LIST_PATH}/${encodeURIComponent(id)}/thumbnail_url`, origin), signal),
      content: (value, signal) => {
        const url = new URL(value);
        if (url.origin === origin && url.pathname === '/backend-api/estuary/content') return get(url, signal);
        if (url.protocol !== 'https:' || !OPENAI_CDN_HOST.test(url.hostname)) {
          throw new Error('Unsupported reference image host');
        }
        return fetcher(url.href, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', signal });
      },
      list: (cursor, signal) => {
        const url = new URL(LIST_PATH, origin);
        url.searchParams.set('limit', '50');
        if (cursor !== null) url.searchParams.set('cursor', cursor);
        return get(url, signal);
      },
    };
  }

  // React stores DOM-side props and the fiber under per-build random suffixes.
  function reactKey(node, prefix) {
    try { return Object.getOwnPropertyNames(node).find(key => key.startsWith(prefix)) || null; }
    catch { return null; }
  }
  function reactFiber(node) {
    const key = reactKey(node, '__reactFiber$');
    return key ? node[key] : null;
  }
  const FIBER_DEPTH = 200;

  function mergeReference(current, placeholder, reference) {
    const result = [...(Array.isArray(current) ? current : Array.isArray(placeholder) ? placeholder : [])];
    const index = result.findIndex(item => item.id === reference.id);
    if (index < 0) result.push(reference);
    else result[index] = reference;
    return result;
  }

  const REFERENCE_HOVER_EVENTS = ['pointerover', 'pointerenter', 'pointermove', 'pointerout', 'pointerleave',
    'mouseover', 'mouseenter', 'mousemove', 'mouseout', 'mouseleave'];
  const REFERENCE_HOVER_PROPS = ['onPointerEnter', 'onPointerLeave', 'onPointerMove', 'onPointerOver', 'onPointerOut',
    'onMouseEnter', 'onMouseLeave', 'onMouseMove', 'onMouseOver', 'onMouseOut'];
  // Each alternative is anchored at the start of the label, excludes library navigation, and needs the
  // "show" verb with either the "used" reference wording or an explicit count, so buttons that preview,
  // remove, add or open the library do not match.
  const REFERENCE_BUTTON_LABEL = new RegExp('^\\s*(?!.*(?:library|보관함|라이브러리|ライブラリ|图库|圖庫|biblioteca|biblioth[èe]que|bibliothek|библиотек))(?:' + [
    '사용(?:된|한)\\s*(?:참고|참조)\\s*(?:자료|이미지).*(?:보기|열기)',
    '(?:참고|참조)\\s*(?:자료|이미지)\\s*\\d+\\s*개\\s*(?:보기|열기)',
    '(?:show|view|see)\\b(?:(?=.*\\bused\\b)|(?=.*\\b\\d+\\b)).*\\breferences?\\b',
    'references?\\b.*\\bused\\b',
    '(?:使用|利用)(?:した|中の)?.*(?:参照|参考)(?:資料|画像).*(?:表示|見る)',
    '(?:显示|查看|顯示|檢視).*(?:(?:所用|使用).*|\\d+\\s*[张張個个]?\\s*)(?:参考图|参考照片|參考資料|參考圖片|參考圖)',
    '(?:mostrar|ver)\\s+(?:(?:la|las|una|a|as|uma)\\s+)?(?:\\d+\\s+refer[êe]ncias?\\b|(?:\\d+\\s+)?refer[êe]ncias?\\s+(?:utilizad[ao]s?|usad[ao]s?)\\b)',
    '(?:afficher|voir)\\s+(?:(?:la|les|une)\\s+)?(?:\\d+\\s+r[ée]f[ée]rences?\\b|(?:\\d+\\s+)?r[ée]f[ée]rences?\\s+utilis[ée]e?s?(?:$|[^a-zA-Z\\u00C0-\\u024F]))',
    '(?:die\\s+)?(?:\\d+\\s+)?verwendete[ns]?\\s+(?:\\d+\\s+)?referenz(?:en)?\\b.*\\banzeigen\\b',
    '(?:die\\s+)?\\d+\\s+referenz(?:en)?\\s+anzeigen\\b',
    '(?:показать|посмотреть)\\s+(?:\\d+\\s+(?:использованн\\S*\\s+)?|использованн\\S*\\s+)референс',
  ].join('|') + ')', 'i');

  function referenceButton(target) {
    const node = target?.nodeType === 3 ? target.parentElement : target;
    const button = typeof node?.closest === 'function' ? node.closest('button') : null;
    return button && REFERENCE_BUTTON_LABEL.test(button.getAttribute('aria-label') || '') ? button : null;
  }

  function patchReactProps(element, keys, prepared, patch) {
    let key = keys.get(element);
    if (!key || !element[key]) {
      key = reactKey(element, '__reactProps$');
      if (!key) return false;
      keys.set(element, key);
    }
    const props = element[key];
    if (!props || prepared.get(element) === props) return false;
    const next = { ...props };
    if (!patch(props, next)) return false;
    try {
      element[key] = next;
      prepared.set(element, next);
      return true;
    } catch {
      return false;
    }
  }

  class ReferenceClickGate {
    constructor(find) {
      this.find = find;
      this.keys = new WeakMap();
      this.prepared = new WeakMap();
      this.ignoreHover = () => {};
    }
    prepare(button) {
      // Stop the native hover callback itself as well as event propagation.
      // Replace the DOM-side props copy, leaving React's original (possibly frozen) props untouched.
      // Window capture still blocks ordinary delegated hover handlers if setting the copy fails.
      patchReactProps(button, this.keys, this.prepared, (_props, next) => {
        let changed = false;
        for (const name of REFERENCE_HOVER_PROPS) for (const variant of [name, name + 'Capture']) {
          if (typeof next[variant] !== 'function') continue;
          next[variant] = this.ignoreHover; changed = true;
        }
        return changed;
      });
    }
    handle(event) {
      if (!REFERENCE_HOVER_EVENTS.includes(event.type)) return false;
      const button = this.find(event.target);
      if (!button) {
        // React dispatches onPointerEnter/onMouseEnter from the previous element's out event, whose
        // relatedTarget is the button. Refresh its props (re-rendered without a DOM mutation) but let the event pass.
        if (/out$/.test(event.type) && event.relatedTarget) {
          const entered = this.find(event.relatedTarget);
          if (entered) this.prepare(entered);
        }
        return false;
      }
      this.prepare(button);
      event.stopImmediatePropagation();
      return true;
    }
  }

  // Radix Menu closes its open menu from a window blur effect: if (!open) return; add "blur"; return remove "blur".
  // Only a cleanup that removes nothing but that window blur listener may be called.
  const WINDOW_BLUR_CLEANUP = /^(?:function\s*[\w$]*\s*\(\s*\)|\(\s*\)\s*=>)\s*(?:\{\s*(?:return\s+)?)?(?:void\s+)?(?:window|self|globalThis)\.removeEventListener\(\s*(["'`])blur\1\s*,\s*[\w$]+\s*\)\s*;?\s*\}?\s*$/;
  const WINDOW_BLUR_SETUP = /(?:window|self|globalThis)\.addEventListener\(\s*(["'`])blur\1/;
  const MENU_ROOT_DEPTH = 8;
  const EFFECT_RING_LIMIT = 64;

  function functionSource(fn) {
    try { return Function.prototype.toString.call(fn); } catch { return ''; }
  }

  function windowBlurCleanups(fiber) {
    const cleanups = new Set();
    for (const node of [fiber, fiber?.alternate]) {
      const last = node?.updateQueue?.lastEffect;
      let effect = last?.next;
      for (let count = 0; effect && count < EFFECT_RING_LIMIT; count++, effect = effect.next) {
        // React 19 keeps destroy on the hook's shared inst; React 18 keeps it on the effect.
        const destroy = effect.inst && typeof effect.inst === 'object' ? effect.inst.destroy : effect.destroy;
        if (typeof destroy === 'function' && typeof effect.create === 'function' &&
            WINDOW_BLUR_CLEANUP.test(functionSource(destroy)) && WINDOW_BLUR_SETUP.test(functionSource(effect.create))) {
          cleanups.add(destroy);
        }
        if (effect === last) break;
      }
    }
    return [...cleanups];
  }

  class ReferenceFocusGate {
    constructor(getMenus, view = null) {
      this.getMenus = getMenus;
      this.view = view;
      this.keys = new WeakMap();
      this.prepared = new WeakMap();
      this.released = new WeakSet();
      this.windowBlurReleases = 0;
    }
    // Remove only this reference menu's native window blur listener. The menu root sits a few fibers above the
    // menu provider whose `content` is this DOM node; stop at another menu's provider instead of crossing into it.
    releaseWindowBlur(menu) {
      let fiber = reactFiber(menu), depth = 0;
      while (fiber && depth < FIBER_DEPTH && fiber.memoizedProps?.content !== menu) { fiber = fiber.return; depth++; }
      if (!fiber || fiber.memoizedProps?.content !== menu) return false;
      for (let level = 0; fiber && level < MENU_ROOT_DEPTH; level++, fiber = fiber.return) {
        const content = fiber.memoizedProps?.content;
        if (content && content !== menu && content.nodeType === 1) return false;
        const cleanups = windowBlurCleanups(fiber);
        if (!cleanups.length) continue;
        let released = false;
        for (const cleanup of cleanups) {
          if (this.released.has(cleanup)) continue;
          try { cleanup(); this.released.add(cleanup); released = true; }
          catch { /* Keep the native listener if its cleanup cannot run. */ }
        }
        if (released) this.windowBlurReleases++;
        return released;
      }
      return false;
    }
    contains(menu, target) {
      try { return Boolean(target && menu.contains(target)); } catch { return false; }
    }
    active(menu) {
      return Boolean(menu?.isConnected && menu.getAttribute?.('data-state') !== 'closed' &&
        [...this.getMenus()].includes(menu));
    }
    keeps(menu, event) {
      return this.active(menu) && !this.contains(menu, event?.relatedTarget);
    }
    prepare(menu) {
      const gate = this;
      return patchReactProps(menu, this.keys, this.prepared, (props, next) => {
        let changed = false;
        for (const name of ['onBlur', 'onBlurCapture']) {
          const original = props[name];
          if (typeof original !== 'function') continue;
          next[name] = function (event, ...args) {
            if (gate.keeps(menu, event)) return;
            return original.call(this, event, ...args);
          };
          changed = true;
        }
        return changed;
      });
    }
    handle(event) {
      if (event.type !== 'blur' && event.type !== 'focusout') return false;
      let handled = false;
      // Window blur: this capture listener runs before the menu's own window listener, and a listener removed
      // during dispatch is skipped. The event itself still propagates to every other listener.
      if (event.type === 'blur' && this.view && event.target === this.view) {
        for (const menu of [...this.getMenus()]) if (this.active(menu)) handled = this.releaseWindowBlur(menu) || handled;
        return handled;
      }
      for (const menu of [...this.getMenus()]) {
        if (this.active(menu) && this.contains(menu, event.target)) handled = this.prepare(menu) || handled;
      }
      return handled;
    }
  }

  const UI_ICONS = Object.freeze({
    search: '🔍', list: '☷', database: '💾', clock: '◷', error: '⚠', refresh: '↻',
    download: '⇩', verify: '🛡', save: '💾', send: '➤', check: '✓', image: '🖼',
  });
  const ICON_SIZE = 18;
  const ICON_FONT = '18px Arial,"DejaVu Sans",sans-serif';
  const refreshGlyphOffsets = new Map();

  // Center the visible ink, rather than the font's advance width and line box.
  function glyphPosition(metrics, baseline, size = ICON_SIZE) {
    const { actualBoundingBoxLeft: left, actualBoundingBoxRight: right,
      actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } = metrics || {};
    if (![left, right, ascent, descent, baseline, size].every(Number.isFinite) ||
        right + left <= 0 || ascent + descent <= 0 || size <= 0) return null;
    return { left: size / 2 - (right - left) / 2, top: size / 2 - baseline - (descent - ascent) / 2 };
  }

  function refreshGlyphPosition(text) {
    const key = ICON_FONT + ':' + text;
    if (refreshGlyphOffsets.has(key)) return refreshGlyphOffsets.get(key);
    const host = document.body || document.documentElement;
    let context = null;
    try { context = document.createElement('canvas').getContext('2d'); } catch { context = null; }
    if (!host || !context) return null;
    let probe, position = null;
    try {
      context.font = ICON_FONT;
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
      context.direction = 'ltr';
      probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;display:block;
        width:max-content;margin:0;padding:0;border:0;white-space:pre;direction:ltr;
        font:${ICON_FONT};line-height:${ICON_SIZE}px;`;
      const baselineMarker = document.createElement('span');
      baselineMarker.style.cssText = 'display:inline-block;width:0;height:0;margin:0;padding:0;border:0;vertical-align:baseline;';
      probe.append(document.createTextNode(text), baselineMarker);
      host.append(probe);
      const baseline = baselineMarker.getBoundingClientRect().top - probe.getBoundingClientRect().top;
      position = glyphPosition(context.measureText(text), baseline);
    } catch { /* A blocked or unavailable font measurement must not break the controls. */ }
    finally {
      probe?.remove();
      refreshGlyphOffsets.set(key, position);
    }
    return position;
  }

  function centerRefreshGlyph(icon) {
    const glyph = icon.querySelector('.ref-fast-glyph');
    const position = glyph && refreshGlyphPosition(glyph.textContent);
    if (!position) {
      icon.classList.remove('ref-fast-centered');
      if (glyph) Object.assign(glyph.style, { position: '', left: '', top: '' });
      return; // Keep the glyph static if precise metrics are unavailable.
    }
    Object.assign(glyph.style, { position: 'absolute', left: `${position.left}px`, top: `${position.top}px` });
    icon.classList.add('ref-fast-centered');
  }

  function uiStatus(tokens, detail) {
    return { tokens, detail, text: tokens.map(token => UI_ICONS[token.icon] +
      (token.error ? '!' : '') + (token.busy ? '…' : '') + (token.value === undefined ? '' : ` ${token.value}`)).join(' · ') };
  }

  function referenceNotice(icon, detail, busy = false, error = false) {
    return uiStatus([{ icon, label: detail, busy, error }], detail);
  }

  function sessionRunning(session) {
    return Boolean(session && !session.complete && !session.failed && !session.controller.signal.aborted);
  }

  function referenceRefreshState(session, available = true, selecting = false, locale = uiLocale()) {
    const busy = sessionRunning(session);
    return { busy, disabled: !available || selecting,
      title: translateUi(selecting ? 'selectingReference' : busy ? 'refreshingRestart' :
        available ? 'refreshInBackground' : 'connectingReferences', {}, locale) };
  }

  function uiIcon(name, busy = false, error = false) {
    const icon = document.createElement('span');
    icon.className = 'ref-fast-symbol' + (name === 'refresh' ? ' ref-fast-refresh' : '') + (busy ? ' ref-fast-working' : '');
    icon.setAttribute('aria-hidden', 'true');
    const glyph = document.createElement('span');
    glyph.className = 'ref-fast-glyph';
    glyph.textContent = UI_ICONS[name] + (name === 'refresh' ? '\uFE0E' : '');
    if (name === 'refresh') {
      const rotor = document.createElement('span');
      rotor.className = 'ref-fast-rotor';
      rotor.append(glyph); icon.append(rotor);
      centerRefreshGlyph(icon);
    } else icon.append(glyph);
    if (error) {
      const badge = document.createElement('span');
      badge.className = 'ref-fast-glyph-badge';
      badge.textContent = '!';
      icon.append(badge);
    }
    return icon;
  }

  const renderedStatus = new WeakMap();
  function renderUiStatus(node, model) {
    const lang = uiLocale();
    node.lang = lang;
    if (model.messageKey) {
      const token = model.tokens[0];
      model = localizedNotice(token.icon, model.messageKey, token.busy, token.error);
    }
    node.title = model.detail;
    if (!node.replaceChildren) { node.textContent = model.text; return; }
    const signature = JSON.stringify([lang, model.detail, model.tokens]);
    if (renderedStatus.get(node) === signature) return;
    renderedStatus.set(node, signature);
    node.setAttribute('aria-label', model.detail);
    node.setAttribute('aria-busy', String(model.tokens.some(token => token.busy)));
    node.replaceChildren(...model.tokens.map(token => {
      const item = document.createElement('span');
      item.className = 'ref-fast-metric';
      item.title = token.label + (token.value === undefined ? '' : `: ${token.value}`);
      item.setAttribute('aria-hidden', 'true');
      item.append(uiIcon(token.icon, token.busy, token.error));
      if (token.parts) {
        const counts = document.createElement('span'); counts.className = 'ref-fast-counts';
        token.parts.forEach((part, index) => {
          if (index) counts.append(document.createTextNode('/'));
          const value = document.createElement('span'); value.className = `ref-fast-count-${part.kind}`;
          value.textContent = part.value; counts.append(value);
        });
        item.append(counts);
      } else if (token.value !== undefined) item.append(document.createTextNode(String(token.value)));
      return item;
    }));
  }

  function referenceStatus({ progress, matched = 0, query = '', pages = 0, refreshing = false, caching = false, checkingCache = false,
    catalogError = false, storageError = null, storageWriteFailed = false,
    previewProgress = null, previewCaching = false, previewPaused = false, readOnly = false, locale = uiLocale() }) {
    const language = resolveUiLocale(locale);
    const number = value => Number(value || 0).toLocaleString(language);
    const t = (key, values) => translateUi(key, values, language);
    const tokens = [];
    const add = (icon, label, value, busy = false, error = false) => tokens.push({ icon, label, value, busy, error });
    const counter = (icon, label, counts, busy = false, error = false) => {
      const complete = Number.isFinite(counts.total) && counts.total >= 0 && counts.ready === counts.total &&
        counts.discovered === counts.total && counts.failed === 0 && counts.pending === 0;
      const parts = complete ? [{ kind: 'total', value: number(counts.total) }] :
        [{ kind: 'success', value: number(counts.ready) }, { kind: 'failure', value: number(counts.failed) },
          { kind: 'total', value: counts.total === null ? '?' : number(counts.total) }];
      tokens.push({ icon, label: t(complete ? 'cacheComplete' : 'counterBreakdown', { label }),
        value: parts.map(part => part.value).join('/'), parts, busy, error });
    };
    if (String(query).trim()) add('search', t('searchResults'), number(matched));
    add('list', t(progress.total === null ? 'referencesUnknown' : 'referencesTotal'),
      progress.total === null ? `${number(progress.discovered)} / ?` : number(progress.total));
    if (!readOnly) {
      counter('database', t('thumbnailCache'), progress);
      if (progress.pending) add('clock', t('cachePending'), number(progress.pending));
      if (previewProgress) {
        counter('image', t('previewCache'), previewProgress, previewCaching && !previewPaused, previewPaused);
      }
    }
    if (catalogError) add('list', t('catalogFailed'), undefined, false, true);
    else if (!readOnly && (refreshing || progress.total === null)) add('refresh', t(refreshing ? 'catalogRefreshing' : 'catalogLoading'), undefined, true);
    if (!readOnly && caching && !storageWriteFailed) add('download', t('caching'), undefined, true);
    if (checkingCache) add('verify', t('checkingCache'), undefined, true);
    if (!readOnly && storageWriteFailed) add('save', t('cacheWriteError'), undefined, false, true);
    else if (storageError) add('database', t('cacheError'), undefined, false, true);
    const details = tokens.map(token => token.label + (token.value === undefined ? '' : ` ${token.value}`));
    details.push(t('catalogPages', { count: number(pages) }), t('discovered', { count: number(progress.discovered) }));
    if (!readOnly) details.push(t('pending', { count: number(progress.pending) }));
    if (previewProgress) details.push(t('previewsDiscovered', { count: number(previewProgress.discovered) }),
      t('previewsPending', { count: number(previewProgress.pending) }));
    if (previewPaused) details.push(t('previewsPaused'));
    if (storageError) details.push(`${storageError.operation}: ${storageError.reason}`);
    return uiStatus(tokens, details.join(' · '));
  }

  function referenceProvider(fiber) {
    const props = fiber.memoizedProps;
    return typeof props?.cacheKey === 'string' && typeof props.onRecreate === 'function' && Array.isArray(props.items) ? props : null;
  }

  // The provider's memo cache holds the react-query scope; its query cache holds the reference list for this provider.
  function referenceQuery(fiber, props, accountId) {
    const scope = (fiber.updateQueue?.memoCache?.data || []).flat().find(value =>
      value && typeof value.get === 'function' && value.queryClient && value.query);
    if (!scope?.queryClient?.getQueryCache) return null;
    const queries = scope.queryClient.getQueryCache().findAll({ queryKey: ['chatgpt-reference-images'] });
    const query = queries.find(query => query.queryKey.length === 3 && query.queryKey[2] === props.cacheKey &&
      (accountId === null || query.queryKey[1] === accountId));
    return query ? { query, scope } : null;
  }

  // Composer @-mention suggestions: ChatGPT renders sections as <div data-mention-section-id="…"> whose rows are
  // button[data-list-navigation-item]; reference rows carry the React key `reference-image:<id>`. References appear
  // in "reference-images", or in "exact-matches" when the query equals a name. The highlighted row (mouse or
  // keyboard) has aria-current="true" (aria-selected="true" in the listbox variant).
  const MENTION_SECTION = '[data-mention-section-id="reference-images"]';
  const MENTION_SECTIONS = '[data-mention-section-id]';
  const MENTION_KEY_PREFIX = 'reference-image:';

  function mentionReferenceId(row) {
    for (let fiber = reactFiber(row), depth = 0; fiber && depth < 12; fiber = fiber.return, depth++) {
      if (typeof fiber.key === 'string' && fiber.key.startsWith(MENTION_KEY_PREFIX)) return fiber.key.slice(MENTION_KEY_PREFIX.length) || null;
    }
    return null;
  }

  // The suggestion's icon component receives { assetPointer, thumbnailAssetPointer }. Search the row's own
  // fiber subtree first, then the keyed row component's content element (rendered lazily off-screen).
  function mentionImagePointers(row) {
    const pointers = props => typeof props?.assetPointer === 'string' && props.assetPointer.startsWith('sediment://') ?
      { asset_pointer: props.assetPointer,
        thumbnail_asset_pointer: typeof props.thumbnailAssetPointer === 'string' && props.thumbnailAssetPointer.startsWith('sediment://') ?
          props.thumbnailAssetPointer : null } : null;
    const host = reactFiber(row);
    const stack = host?.child ? [host.child] : [];
    for (let seen = 0; stack.length && seen < 200; seen++) {
      const node = stack.pop();
      const found = pointers(node.memoizedProps);
      if (found) return found;
      if (node.sibling) stack.push(node.sibling);
      if (node.child) stack.push(node.child);
    }
    for (let fiber = host, depth = 0; fiber && depth < 12; fiber = fiber.return, depth++) {
      const found = pointers(fiber.memoizedProps?.children?.props?.entry?.iconElement?.props);
      if (found) return found;
    }
    return null;
  }

  // Inserted reference mentions (composer pills and sent prompts) carry
  // data-prompt-link-href="chatgpt-reference-image://<id>?assetPointer=…&thumbnailAssetPointer=…" and draw their icon
  // from the same 50-entry app cache as the suggestions.
  const REFERENCE_PILL = '[data-prompt-link-href^="chatgpt-reference-image://"]';

  function referencePill(href) {
    const prefix = 'chatgpt-reference-image://';
    if (typeof href !== 'string' || !href.startsWith(prefix)) return null;
    try {
      const raw = href.slice(prefix.length);
      const qIndex = raw.indexOf('?');
      const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
      const query = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
      const id = decodeURIComponent(path).trim();
      const params = new URLSearchParams(query);
      const asset = params.get('assetPointer'), thumbnail = params.get('thumbnailAssetPointer');
      if (!id || !asset?.startsWith('sediment://')) return null;
      return { id, pointers: { asset_pointer: asset, thumbnail_asset_pointer: thumbnail?.startsWith('sediment://') ? thumbnail : null } };
    } catch { return null; }
  }

  // The icon slot: the largest square, icon-sized ancestor of the image or fallback glyph. A padded inline
  // wrapper (a composer pill's 23×16 icon span, for example) is not the slot the 20×20 image occupies.
  function mentionIconBox(row) {
    const glyph = row.querySelector('img:not([data-ref-fast-mention-icon]), svg');
    if (!glyph) return null;
    let box = glyph;
    while (box.parentElement && box.parentElement !== row) {
      const rect = box.parentElement.getBoundingClientRect();
      if (rect.width > 40 || rect.height > 40 || Math.abs(rect.width - rect.height) > 2) break;
      box = box.parentElement;
    }
    return box;
  }

  // Where an @-mention preview is anchored: the suggestion list around the highlighted row.
  function mentionContainer(found) {
    return found.row.closest('[role="listbox"]') || found.section.parentElement || found.section;
  }

  // Keys looked up without a result are not retried for a while.
  class RecentMisses {
    constructor(lifetime = 60000, now = Date.now) { this.lifetime = lifetime; this.now = now; this.at = new Map(); }
    has(key) { const at = this.at.get(key); return at !== undefined && this.now() - at < this.lifetime; }
    add(key) { this.at.set(key, this.now()); }
    delete(key) { this.at.delete(key); }
    clear() { this.at.clear(); }
  }

  function mentionHighlighted(row) {
    return row?.getAttribute?.('aria-selected') === 'true' || row?.getAttribute?.('aria-current') === 'true';
  }

  function highlightedMention(root) {
    for (const section of root.querySelectorAll(MENTION_SECTIONS)) {
      const row = section.querySelector('[aria-selected="true"], [aria-current="true"]');
      if (row && mentionReferenceId(row)) return { row, section };
    }
    return null;
  }

  function rowFiberInfo(row) {
    let referenceId = null;
    for (let fiber = reactFiber(row), depth = 0; fiber && depth < FIBER_DEPTH; depth += 1, fiber = fiber.return) {
      if (!referenceId && typeof fiber.key === 'string' && /^AccountUserId_[\w-]+~refimage_/.test(fiber.key)) {
        referenceId = fiber.key;
      }
      const props = referenceProvider(fiber);
      if (props) return { fiber, props, referenceId };
    }
    return { fiber: null, props: null, referenceId };
  }

  function isLibraryMenuItem(row) {
    const { props, referenceId } = rowFiberInfo(row);
    if (!props) return true;
    if (!referenceId) return false;
    return !props.items.some(item => item.reference_image_id === referenceId);
  }

  function nativeCatalog(node, accountId) {
    for (let fiber = reactFiber(node), depth = 0; fiber && depth < FIBER_DEPTH; fiber = fiber.return, depth++) {
      const props = referenceProvider(fiber);
      const found = props && referenceQuery(fiber, props, accountId);
      if (found) return { ...found, cacheKey: props.cacheKey };
    }
    return null;
  }

  function nativeSelection(row, accountId) {
    const { fiber, props, referenceId } = rowFiberInfo(row);
    if (!props || !referenceId || props.items.some(item => item.reference_image_id === referenceId)) return null; // Edit entries keep the native flow.
    const found = referenceQuery(fiber, props, accountId);
    if (!found) return null;
    const { query, scope } = found;
    const current = Array.isArray(query.state.data) ? query.state.data : [];
    const placeholder = Array.isArray(query.options.placeholderData) ? query.options.placeholderData : [];
    const reference = cleanReference(current.find(item => item.id === referenceId) || placeholder.find(item => item.id === referenceId));
    if (!reference?.asset_pointer) return null;
    return { reference, query, scope, cacheKey: props.cacheKey, onRecreate: props.onRecreate, placeholder };
  }

  async function boundedImage(download, milliseconds, parentSignal) {
    const controller = new AbortController();
    let timer;
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const cancel = () => { controller.abort(); rejectAbort(new DOMException('Request cancelled', 'AbortError')); };
    parentSignal?.addEventListener('abort', cancel, { once: true });
    if (parentSignal?.aborted) cancel();
    try {
      return await Promise.race([
        aborted,
        (async () => {
          controller.signal.throwIfAborted();
          const response = await download(controller.signal);
          const body = await response.blob();
          return new Response([204, 205, 304].includes(response.status) ? null : body, {
            status: response.status, statusText: response.statusText, headers: response.headers,
          });
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new DOMException('Reference image timed out', 'TimeoutError'));
          }, milliseconds);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', cancel);
    }
  }

  class DownloadQueue {
    constructor(limit, backgroundLimit = limit) {
      this.limit = limit;
      this.backgroundLimit = backgroundLimit;
      this.active = 0;
      this.activeBackground = 0;
      this.queued = new Set();
    }

    get size() { return this.queued.size; }
    get jobs() { return [...this.queued]; }

    run(task, signal, foreground = () => true) {
      return new Promise((resolve, reject) => {
        const job = { task, signal, resolve, reject, foreground };
        const cancel = () => {
          if (this.queued.delete(job)) {
            job.cleanup();
            reject(new DOMException('Request cancelled', 'AbortError'));
          }
        };
        job.cleanup = () => signal?.removeEventListener('abort', cancel);
        if (signal?.aborted) {
          reject(new DOMException('Request cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', cancel, { once: true });
        this.queued.add(job);
        this.drain();
      });
    }

    drain() {
      while (this.active < this.limit && this.queued.size) {
        let picked = null, foreground = false;
        for (const job of this.queued) {
          if (job.foreground()) {
            picked = job;
            foreground = true;
            break;
          }
          if (!picked) picked = job;
        }
        if (!picked) break;
        if (!foreground && this.activeBackground >= this.backgroundLimit) break;
        this.queued.delete(picked);
        picked.cleanup();
        if (picked.signal?.aborted) {
          picked.reject(new DOMException('Request cancelled', 'AbortError'));
          continue;
        }
        const background = !foreground;
        this.active += 1;
        if (background) this.activeBackground += 1;
        Promise.resolve().then(picked.task).then(picked.resolve, picked.reject).finally(() => {
          this.active -= 1;
          if (background) this.activeBackground -= 1;
          this.drain();
        });
      }
    }
  }

  class ThumbnailInventory {
    constructor(fileFor = reference => referenceFile(reference)) {
      this.fileFor = fileFor; this.reset();
    }
    reset() { this.items = new Map(); this.byFile = new Map(); this.counts = { pending: 0, ready: 0, failed: 0 }; this.known = false; }
    remove(id) {
      const item = this.items.get(id);
      if (!item) return;
      this.counts[item.status]--;
      this.items.delete(id);
      const bucket = this.byFile.get(item.file);
      bucket?.delete(id);
      if (!bucket?.size) this.byFile.delete(item.file);
    }
    register(items) {
      for (const reference of items) {
        const file = this.fileFor(reference);
        const previous = this.items.get(reference.id);
        if (previous?.file === file) continue;
        this.remove(reference.id);
        const item = { file, status: file ? 'pending' : 'failed' };
        this.items.set(reference.id, item);
        this.counts[item.status]++;
        const bucket = this.byFile.get(file) || new Set();
        bucket.add(reference.id); this.byFile.set(file, bucket);
      }
    }
    mark(file, status) {
      for (const id of this.byFile.get(file) || []) {
        const item = this.items.get(id);
        if (item.status === status) continue;
        this.counts[item.status]--; this.counts[status]++; item.status = status;
      }
    }
    finish(items) {
      this.register(items);
      const ids = new Set(items.map(item => item.id));
      for (const id of this.items.keys()) if (!ids.has(id)) this.remove(id);
      this.known = true;
    }
    summary() {
      const { ready, failed, pending } = this.counts;
      return { total: this.known ? this.items.size : null, discovered: this.items.size, ready, failed,
        pending, complete: this.known && ready === this.items.size };
    }
  }

  // Share the original response between thumbnail and preview work. Keep only a
  // short, bounded overlap window so neighbouring queue jobs can reuse it too.
  class SharedImages {
    constructor({ limit = 6, maxBytes = 32 * 1024 * 1024, lifetime = 3000 } = {}) {
      Object.assign(this, { limit, maxBytes, lifetime }); this.entries = new Map(); this.bytes = 0;
    }
    remove(key, entry) {
      if (this.entries.get(key) !== entry) return;
      this.entries.delete(key); clearTimeout(entry.timer);
      if (entry.retained) this.bytes -= entry.data.blob.size;
    }
    async get(key, load, signal) {
      signal?.throwIfAborted();
      let entry = this.entries.get(key);
      if (!entry) {
        entry = { controller: new AbortController(), users: 0, settled: false };
        this.entries.set(key, entry);
        entry.promise = Promise.resolve().then(() => load(entry.controller.signal)).then(async response => {
          const data = { blob: await response.blob(), status: response.status, statusText: response.statusText, headers: response.headers };
          entry.settled = true; entry.data = data;
          if (this.entries.get(key) === entry && response.ok && /^image\//i.test(data.blob.type) && data.blob.size <= this.maxBytes) {
            entry.retained = true; this.bytes += data.blob.size;
            entry.timer = setTimeout(() => this.remove(key, entry), this.lifetime); entry.timer?.unref?.();
            for (const [oldKey, old] of this.entries) {
              if (this.entries.size <= this.limit && this.bytes <= this.maxBytes) break;
              if (old.settled) this.remove(oldKey, old);
            }
          } else this.remove(key, entry);
          return data;
        }).catch(error => { entry.settled = true; this.remove(key, entry); throw error; });
        entry.promise.catch(() => {});
      }
      entry.users++;
      try {
        const data = await waitWithSignal(entry.promise, signal);
        return new Response([204,205,304].includes(data.status) ? null : data.blob, data);
      } finally {
        entry.users--;
        if (!entry.users && !entry.settled) { entry.controller.abort(); this.remove(key, entry); }
      }
    }
    clear() { for (const [key, entry] of this.entries) { entry.controller.abort(); this.remove(key, entry); } }
  }

  class PreviewLoader {
    constructor({ cache, queue, load, scope, changed = () => {} }) {
      Object.assign(this, { cache, queue, load, scope, changed });
      this.inventory = new ThumbnailInventory(reference =>
        referenceFile(reference) ? previewKey('', reference) : null);
      this.references = new Map(); this.tasks = new Map(); this.visible = new Set(); this.wanted = new Map(); this.paused = null;
      this.storageFailed = new Set(); // Entry keys marked failed only because their disk write could not run.
      cache.protectionReady = false;
      cache.onRemoved = keys => this.removed(keys);
      cache.onReady = record => this.confirm(record);
    }
    current(entry) { return entry.transport.scope === this.scope() && this.references.get(entry.reference.id) === entry; }
    register(scope, reference, transport, retrySet = null) {
      if (scope !== this.scope()) return;
      const key = previewKey(scope, reference), old = this.references.get(reference.id);
      this.inventory.register([reference]);
      if (old?.key !== key) {
        if (old) { this.tasks.get(old.key)?.controller.abort(); this.cache.protectedKeys.delete(old.key); }
        const entry = { key, reference, transport, signature: previewKey('', reference) };
        this.references.set(reference.id, entry); this.cache.protectedKeys.add(key);
      } else { old.reference = reference; old.transport = transport; }
      const entry = this.references.get(reference.id), item = this.inventory.items.get(reference.id);
      if (retrySet && !retrySet.has(key)) {
        retrySet.add(key);
        const writePaused = this.paused && this.paused.cacheStorageOperation !== 'read';
        if (!writePaused && item?.file && !this.storageFailed.has(entry.key) && item.status === 'failed') {
          this.inventory.mark(entry.signature, 'pending');
        }
      }
      if (!this.paused && this.inventory.items.get(reference.id)?.status === 'pending') this.ensure(entry);
      this.changed();
    }
    finish(scope, references) {
      if (scope !== this.scope()) return;
      const ids = new Set(references.map(reference => reference.id));
      for (const [id, entry] of this.references) if (!ids.has(id)) {
        this.tasks.get(entry.key)?.controller.abort(); this.references.delete(id); this.cache.protectedKeys.delete(entry.key);
      }
      this.inventory.finish(references); this.cache.protectionReady = true;
      if (this.paused?.cacheStorageOperation === 'read') {
        this.paused = null;
        Promise.allSettled([...this.tasks.values()].map(task => task.done)).then(() => {
          if (scope !== this.scope() || this.paused) return;
          for (const entry of this.references.values()) if (this.inventory.items.get(entry.reference.id)?.status === 'pending') this.ensure(entry);
        });
      }
      this.cache.prune().catch(() => {}); this.changed();
    }
    ensure(entry, override = null) {
      if (this.tasks.has(entry.key)) return this.tasks.get(entry.key);
      let resolve, reject;
      const ready = new Promise((yes, no) => { resolve = yes; reject = no; }); ready.catch(() => {});
      const task = { controller: new AbortController(), ready, resolve, reject, started: false,
        load: override || (signal => this.load(entry.reference, entry.transport, signal)) };
      this.tasks.set(entry.key, task); this.inventory.mark(entry.signature, 'pending');
      task.done = this.queue.run(async () => {
        task.started = true;
        const signal = task.controller.signal;
        // A superseded cache write (AbortError while still current) is retried; an account change is not.
        await withRetries(signal, async () => {
          signal.throwIfAborted();
          if (!this.current(entry)) throw new DOMException('Preview account changed', 'AbortError');
          let result = await this.cache.read(entry.key, signal);
          if (!result) {
            const response = await boundedImage(signal => task.load(signal), CONFIG.requestTimeoutSeconds * 1000, signal);
            if (!response.ok) { const error = new Error('Preview download failed'); error.retryable = response.status >= 500; throw error; }
            result = await this.cache.store(entry.key, await response.blob(), signal);
          }
          if (!this.current(entry)) throw new DOMException('Preview account changed', 'AbortError');
          task.resolve(result.record); // A popup can display this before the disk commit.
          await result.committed;
          signal.throwIfAborted();
          if (this.current(entry)) this.inventory.mark(entry.signature, 'ready');
        }, error => error.cacheStorageFailure || !this.current(entry));
      }, task.controller.signal, () => this.visible.has(entry.reference.id) || this.wanted.has(entry.key)).catch(error => {
        task.reject(error);
        if (!this.current(entry) || task.controller.signal.aborted) return;
        if (error.cacheStorageFailure) {
          if (this.inventory.items.get(entry.reference.id)?.status !== 'ready') {
            const read = error.cacheStorageOperation === 'read';
            this.inventory.mark(entry.signature, read ? 'pending' : 'failed');
            if (!read) this.storageFailed.add(entry.key);
          }
          this.paused = error;
          for (const other of this.references.values()) if (this.inventory.items.get(other.reference.id)?.status !== 'ready') {
            // Unchecked/aborted jobs are pending, not image failures.
            const pending = this.tasks.get(other.key);
            if (pending && pending !== task) { pending.reject(error); pending.controller.abort(); }
          }
        } else if (error?.name !== 'AbortError') this.inventory.mark(entry.signature, 'failed');
      }).finally(() => {
        if (this.tasks.get(entry.key) === task) this.tasks.delete(entry.key);
        if (!this.tasks.size && !this.paused) this.cache.prune().catch(() => {});
        this.changed();
      });
      this.changed(); return task;
    }
    confirm(record) {
      let id;
      try { id = JSON.parse(record.key)[1]; } catch { return; }
      const entry = this.references.get(id);
      if (!entry || entry.key !== record.key || !this.current(entry)) return;
      this.inventory.mark(entry.signature, 'ready'); this.changed();
    }
    async request(reference, transport, signal, override) {
      signal?.throwIfAborted();
      this.register(transport.scope, reference, transport);
      if (this.paused) throw this.paused;
      const entry = this.references.get(reference.id);
      if (!entry || !this.current(entry)) throw new DOMException('Preview account changed', 'AbortError');
      this.wanted.set(entry.key, (this.wanted.get(entry.key) || 0) + 1);
      const task = this.ensure(entry, override);
      if (!task.started && override) task.load = override;
      this.queue.drain();
      try { return await waitWithSignal(task.ready, signal); }
      finally {
        const count = this.wanted.get(entry.key) || 0;
        if (count <= 1) this.wanted.delete(entry.key); else this.wanted.set(entry.key, count - 1);
      }
    }
    // After the database reconnects, a pause caused by the lost connection is lifted and its work rerun.
    // Pauses from other storage errors (such as quota) keep the existing policy.
    resumeAfterReconnect() {
      if (!this.paused?.cacheConnectionFailure) return false;
      this.paused = null;
      for (const entry of this.references.values()) {
        const status = this.inventory.items.get(entry.reference.id)?.status;
        if (status === 'failed' && this.storageFailed.has(entry.key)) this.inventory.mark(entry.signature, 'pending');
      }
      this.storageFailed.clear();
      for (const entry of this.references.values()) if (this.inventory.items.get(entry.reference.id)?.status === 'pending') this.ensure(entry);
      this.changed();
      return true;
    }
    setVisible(ids) { this.visible = new Set(ids); this.queue.drain(); }
    removed(keys) {
      const removed = new Set(keys);
      for (const entry of this.references.values()) if (removed.has(entry.key) && this.inventory.items.get(entry.reference.id)?.status === 'ready') {
        this.inventory.mark(entry.signature, 'pending'); if (!this.paused) this.ensure(entry);
      }
      this.changed();
    }
    reset() {
      for (const task of this.tasks.values()) { task.reject(new DOMException('Preview account changed', 'AbortError')); task.controller.abort(); }
      this.tasks.clear(); this.references.clear(); this.visible.clear(); this.wanted.clear(); this.inventory.reset();
      this.paused = null; this.storageFailed.clear(); this.cache.protectedKeys.clear(); this.cache.protectionReady = false; this.changed();
    }
  }

  const CHAT_CACHE_PREFIX = 'reference-menu-fast-chat-v1:';
  const CHAT_CACHE_RECENT_KEY = 'reference-menu-fast-recent-chats-v1';

  function chatIdFor(value) {
    try { return new URL(value).pathname.match(/^(?:\/g\/[^/]+)?\/c\/([a-zA-Z0-9_-]+)\/?$/)?.[1] || null; }
    catch { return null; }
  }

  // Only chat IDs and a run flag are persisted. Credentials stay in this page.
  class ChatCacheSession {
    constructor({ storage, start, cancel, changed = () => {} }) {
      Object.assign(this, { storage, start, cancel, changed });
      this.chatId = null; this.enabled = false; this.running = false;
      this.context = null; this.controller = null; this.pageActive = true; this.storageError = false; this.fallback = null;
      // Chat and credentials key whose start failed. Requests made by the app do not retry it;
      // the next menu open (begin), another chat or another account does.
      this.failedStart = null;
    }
    normalize(ids) {
      return [...new Set(ids.filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id)))].slice(0, CONFIG.resumeChats);
    }
    legacyKeys() { return (this.storage.keys?.() || []).filter(key => key?.startsWith(CHAT_CACHE_PREFIX)); }
    persist(ids, legacy = this.legacyKeys()) {
      this.fallback = ids;
      try {
        this.storage.setItem(CHAT_CACHE_RECENT_KEY, JSON.stringify(ids));
        for (const key of legacy) this.storage.removeItem(key);
        this.fallback = null; this.storageError = false;
      } catch { this.storageError = true; }
    }
    recent() {
      if (this.fallback) return this.fallback.slice();
      try {
        const raw = this.storage.getItem(CHAT_CACHE_RECENT_KEY);
        if (raw !== null) {
          const ids = JSON.parse(raw);
          const clean = this.normalize(Array.isArray(ids) ? ids : []);
          if (JSON.stringify(clean) !== raw) this.persist(clean);
          return clean;
        }
        const legacy = this.legacyKeys(), enabled = [];
        for (const key of legacy) {
          try { if (JSON.parse(this.storage.getItem(key))?.enabled === true) enabled.push(key.slice(CHAT_CACHE_PREFIX.length)); }
          catch { /* Leave malformed entries out of the migration. */ }
        }
        // Old flags have no timestamps. Keep the current chat first on migration;
        // subsequent menu openings establish the exact newest-first order.
        const ids = this.normalize([...(enabled.includes(this.chatId) ? [this.chatId] : []), ...enabled.reverse()]);
        if (legacy.length) this.persist(ids, legacy);
        return ids;
      } catch { this.storageError = true; return []; }
    }
    read(id) { return this.recent().includes(id); }
    write(id, enabled) {
      const recent = this.recent().filter(item => item !== id);
      const ids = this.normalize(enabled ? [id, ...recent] : recent);
      try { this.persist(ids); }
      catch { this.fallback = ids; this.storageError = true; }
    }
    route(value) {
      const id = chatIdFor(value);
      if (id === this.chatId) return;
      this.failedStart = null;
      this.suspend(); this.chatId = id; this.enabled = Boolean(id && this.read(id));
      this.resume(); this.changed();
    }
    credentials(context) {
      const changed = this.context?.key !== context?.key;
      if (changed) { this.failedStart = null; this.suspend(); }
      this.context = context;
      this.resume(); this.changed();
    }
    begin() {
      if (!this.chatId) return;
      this.failedStart = null;
      this.write(this.chatId, true); this.enabled = true; this.resume(); this.changed();
    }
    stop() {
      if (this.chatId) this.write(this.chatId, false);
      this.enabled = false; this.suspend(); this.changed();
    }
    deleted(id) {
      if (!id) return;
      this.write(id, false);
      if (id === this.chatId) { this.enabled = false; this.suspend(); this.changed(); }
    }
    external(key) {
      if (key !== null && key !== CHAT_CACHE_RECENT_KEY && !key?.startsWith(CHAT_CACHE_PREFIX)) return;
      this.fallback = null;
      const enabled = Boolean(this.chatId && this.read(this.chatId));
      if (!enabled) this.suspend();
      this.enabled = enabled; this.resume(); this.changed();
    }
    suspend() {
      if (this.controller) this.controller.abort();
      const wasRunning = this.running;
      this.running = false; this.controller = null;
      if (wasRunning) this.cancel();
    }
    resume() {
      if (!this.pageActive || !this.chatId || !this.enabled || !this.context || this.running) return;
      const attempt = { chatId: this.chatId, key: this.context.key, auth: this.context.authorization ?? null };
      if (this.failedStart && this.failedStart.chatId === attempt.chatId &&
          this.failedStart.key === attempt.key && this.failedStart.auth === attempt.auth) return;
      const controller = new AbortController(); this.controller = controller; this.running = true;
      Promise.resolve().then(() => {
        if (!controller.signal.aborted && this.controller === controller) return this.start(this.context, controller.signal);
      }).then(() => {
        if (this.controller === controller) this.failedStart = null;
      }, () => {
        // Startup failure leaves caching idle until the next open, token rotation, chat or account.
        if (this.controller === controller) { this.running = false; this.controller = null; this.failedStart = attempt; }
      }).finally(() => this.changed());
    }
  }

  function conversationIdFromPath(pathname) {
    return typeof pathname === 'string'
      ? pathname.match(/^\/backend-api\/conversation\/([a-zA-Z0-9_-]+)\/?$/)?.[1] || null
      : null;
  }

  async function deletedChatId(url, method, input, init) {
    const id = conversationIdFromPath(url.pathname);
    if (!id) return null;
    if (method === 'DELETE') return id;
    if (method !== 'PATCH') return null;
    try {
      const body = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
      return typeof body === 'string' && JSON.parse(body)?.is_visible === false ? id : null;
    } catch { return null; }
  }

  class AccessWriteBatch {
    constructor(write, { delay = CONFIG.accessWriteDelayMs, size = CONFIG.accessWriteBatchSize,
      interval = CONFIG.accessWriteIntervalMs } = {}) {
      Object.assign(this, { write, delay, size, interval });
      this.pending = new Map(); this.written = new Map(); this.timer = null; this.flushing = null; this.generation = 0;
    }
    prime(key, at) { this.written.set(key, at || 0); }
    schedule() {
      if (this.timer !== null) return;
      this.timer = setTimeout(() => { void this.flush(); }, this.delay);
      this.timer?.unref?.();
    }
    touch(key, at = Date.now()) {
      if (at - (this.written.get(key) || 0) < this.interval) return;
      this.pending.set(key, Math.max(at, this.pending.get(key) || 0));
      if (this.pending.size >= this.size) { void this.flush(); return; }
      this.schedule();
    }
    flush() {
      clearTimeout(this.timer); this.timer = null;
      for (const [key, at] of this.pending) if (at - (this.written.get(key) || 0) < this.interval) this.pending.delete(key);
      if (!this.pending.size) return this.flushing || Promise.resolve();
      const batch = this.pending; this.pending = new Map();
      const generation = this.generation;
      const run = () => Promise.resolve().then(() => this.write(batch)).then(() => {
        if (generation === this.generation) for (const [key, at] of batch) this.written.set(key, at);
      }).catch(() => {});
      const current = (this.flushing ? this.flushing.then(run, run) : run()).finally(() => {
        if (this.flushing === current) {
          this.flushing = null;
          if (this.pending.size && this.timer === null) this.schedule();
        }
      });
      this.flushing = current;
      return current;
    }
    clear() { this.generation++; clearTimeout(this.timer); this.timer = null; this.pending.clear(); this.written.clear(); }
  }

  class MenuRows {
    constructor(index, readLabels, readId = () => null) { this.index = index; this.readLabels = readLabels; this.readId = readId; }
    init(state) {
      Object.assign(state, { rows: [], filteredRows: [], references: new Map(), rowsByFile: new Map(),
        readOnlyRefs: new Map(), readOnlyByFile: new Map(), lastItemCount: 0,
        details: new Map(), rowsById: new Map(), rowsByLabel: new Map(), dirtyIds: new Set(), dirtyNames: new Set(), dirtyRows: new Set(), query: null });
    }
    isManaged(state, row) { return Boolean(state?.details?.has(row)); }
    attach(state, row) {
      const labels = this.readLabels(row);
      const id = this.readId(row) || null;
      state.details.set(row, { id, labels, fallback: row.getAttribute('aria-label') || row.textContent, normalized: null });
      if (id) {
        const bucket = state.rowsById?.get(id) || new Set(); bucket.add(row); state.rowsById?.set(id, bucket);
      }
      for (const label of labels) {
        const bucket = state.rowsByLabel.get(label) || new Set(); bucket.add(row); state.rowsByLabel.set(label, bucket);
      }
      row.classList.add('ref-fast-row'); this.bind(state, row);
    }
    detach(state, row) {
      const detail = state.details.get(row);
      if (!detail) return;
      if (detail.id) {
        const rows = state.rowsById?.get(detail.id); rows?.delete(row);
        if (!rows?.size) state.rowsById?.delete(detail.id);
      }
      for (const label of detail.labels) {
        const rows = state.rowsByLabel.get(label); rows?.delete(row);
        if (!rows?.size) state.rowsByLabel.delete(label);
      }
      this.unbind(state, row);
      state.details.delete(row);
    }
    unbind(state, row) {
      const previous = state.references.get(row);
      if (previous) for (const file of this.index.files(previous)) {
        const bucket = state.rowsByFile.get(file); bucket?.delete(row);
        if (!bucket?.size) state.rowsByFile.delete(file);
      }
      state.references.delete(row);
    }
    bind(state, row) {
      const detail = state.details.get(row);
      const ref = (detail.id ? this.index.byId.get(detail.id) : null) ||
        detail.labels.map(label => this.index.byName.get(label)).find(refs => refs?.length === 1)?.[0] || null;
      const previous = state.references.get(row) || null;
      if (previous === ref && detail.normalized !== null) return false;
      this.unbind(state, row);
      if (ref) {
        state.references.set(row, ref);
        for (const file of this.index.files(ref)) {
          const bucket = state.rowsByFile.get(file) || new Set(); bucket.add(row); state.rowsByFile.set(file, bucket);
        }
      }
      detail.normalized = normalize(ref?.entity_name || detail.fallback);
      return true;
    }
    sync(state, rows) {
      const same = rows.length === state.rows.length && rows.every((row, i) => row === state.rows[i]);
      if (!same) {
        const current = new Set(rows);
        for (const row of state.rows) if (!current.has(row)) this.detach(state, row);
        for (const row of rows) if (!state.details.has(row)) this.attach(state, row);
        state.rows = rows;
      }
      let changed = !same;
      const affected = new Set(state.dirtyRows);
      for (const id of state.dirtyIds || []) for (const row of state.rowsById?.get(id) || []) affected.add(row);
      for (const name of state.dirtyNames) for (const row of state.rowsByLabel.get(name) || []) affected.add(row);
      for (const row of affected) if (state.details.has(row)) {
        this.detach(state, row); this.attach(state, row); changed = true;
      }
      state.dirtyRows.clear();
      state.dirtyIds?.clear();
      state.dirtyNames.clear();
      return changed;
    }
    filter(state, query) {
      const words = searchWords(query);
      const rows = [];
      for (const row of state.rows) {
        const match = matchesWords(state.details.get(row).normalized, words);
        if (row.hidden !== !match) row.hidden = !match;
        if (match) rows.push(row);
      }
      state.filteredRows = rows; state.matched = rows.length; state.query = query;
    }
    visible(state, viewportHeight) {
      const bounds = state.menu.getBoundingClientRect();
      const top = Math.max(0, bounds.top), bottom = Math.min(viewportHeight, bounds.bottom);
      const rows = state.filteredRows;
      let low = 0, high = rows.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        const rect = rows[middle].getBoundingClientRect();
        if (rect.height > 0) {
          if (rect.bottom <= top) low = middle + 1; else high = middle;
          continue;
        }
        let probe = middle + 1, probeRect = null;
        while (probe < high) {
          const candidate = rows[probe].getBoundingClientRect();
          if (candidate.height > 0) { probeRect = candidate; break; }
          probe++;
        }
        if (probeRect) {
          if (probeRect.bottom <= top) low = probe + 1; else high = middle;
        } else {
          high = middle;
        }
      }
      const result = [];
      for (let i = low; i < rows.length; i++) {
        const rect = rows[i].getBoundingClientRect();
        if (rect.height <= 0) continue;
        if (rect.top >= bottom) break;
        if (rect.bottom > top) result.push(rows[i]);
      }
      return result;
    }
  }

  function waitWithSignal(promise, signal) {
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
      const abort = () => { cleanup(); reject(new DOMException('Menu request cancelled', 'AbortError')); };
      const cleanup = () => signal.removeEventListener('abort', abort);
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
  }

  async function waitCatalogPage(session, cursor, signal) {
    signal?.throwIfAborted();
    try { return await waitWithSignal(session.page(cursor), signal); }
    catch (error) {
      if (signal?.aborted || error?.name !== 'AbortError' || !session.replacement) throw error;
      // The menu may already have earlier pages. Finish its pending pagination
      // from the replacement snapshot without duplicating those earlier IDs.
      // publish() replaces the entire native query after that query settles.
      const previous = new Set(), visited = new Set();
      for (let before = null; before !== cursor && !visited.has(before);) {
        visited.add(before);
        const page = session.pages.get(before);
        if (!page) break;
        for (const item of page.items) previous.add(item.id);
        before = page.next_cursor;
        if (before === null) break;
      }
      let replacement = session.replacement;
      for (;;) {
        try {
          const pages = await waitWithSignal(replacement.start(), signal);
          return { items: pages.flatMap(page => page.items).filter(item => !previous.has(item.id)), next_cursor: null };
        } catch (next) {
          if (signal?.aborted || next?.name !== 'AbortError' || !replacement.replacement) throw next;
          replacement = replacement.replacement;
        }
      }
    }
  }

  function retryPause(attempt, signal) {
    let timer;
    const pause = new Promise(resolve => { timer = setTimeout(resolve, 300 * 2 ** attempt); });
    return waitWithSignal(pause, signal).finally(() => clearTimeout(timer));
  }

  // Run attempt(index) up to `attempts` times with backoff. Cancellation, non-retryable responses
  // (retryable === false) and errors the caller marks fatal are thrown immediately.
  async function withRetries(signal, attempt, fatal = () => false, attempts = CONFIG.cacheAttempts) {
    for (let index = 0; ; index++) {
      try { return await attempt(index); }
      catch (error) {
        if (signal?.aborted || error?.retryable === false || fatal(error) || index + 1 >= attempts) throw error;
        await retryPause(index, signal);
      }
    }
  }

  class CatalogSession {
    constructor({ owner, provisional = false, onOwner = null, request, onPage, onComplete, timeout = 30000 }) {
      Object.assign(this, { owner, provisional, onOwner, request, onPage, onComplete, timeout });
      this.controller = new AbortController();
      this.requests = new Map();
      this.pages = new Map();
      this.complete = false;
    }
    async accept(cursor, body) {
      this.controller.signal.throwIfAborted();
      const items = Array.isArray(body?.items) ? body.items.map(cleanReference) : null;
      const pageOwner = items?.length ? verifiedOwner(items) : null;
      if (!items || items.some(item => !item) || (body.next_cursor != null && typeof body.next_cursor !== 'string') ||
          (items.length && (this.owner || this.provisional) && !pageOwner)) {
        const error = new Error('Invalid reference catalog page'); error.retryable = false; throw error;
      }
      if (items.length && pageOwner) {
        if (this.provisional) {
          this.provisional = false;
          this.owner = pageOwner;
          this.onOwner?.(pageOwner);
        } else if (this.owner && pageOwner !== this.owner) {
          const error = new Error('Invalid reference catalog page'); error.retryable = false; throw error;
        }
      }
      const page = { items, next_cursor: body.next_cursor ?? null };
      this.pages.set(cursor, { cursor, ...page });
      await this.onPage(items, cursor, page);
      return page;
    }
    prime(cursor, body) {
      if (!this.requests.has(cursor)) this.requests.set(cursor, this.accept(cursor, body));
      return this.requests.get(cursor);
    }
    page(cursor) {
      if (!this.requests.has(cursor)) this.requests.set(cursor, withRetries(this.controller.signal, async () => {
        const response = await boundedImage(signal => this.request(cursor, signal), this.timeout, this.controller.signal);
        if (!response.ok) {
          const error = new Error('Reference catalog request failed');
          error.retryable = response.status >= 500;
          throw error;
        }
        return this.accept(cursor, await response.json());
      }));
      return this.requests.get(cursor);
    }
    start() {
      if (!this.done) this.done = (async () => {
        let cursor = null;
        const visited = new Set();
        do {
          if (visited.has(cursor)) throw new Error('Repeated reference cursor');
          visited.add(cursor);
          const page = await this.page(cursor);
          cursor = page.next_cursor;
        } while (cursor !== null);
        this.controller.signal.throwIfAborted();
        const pages = [...visited].map(cursor => this.pages.get(cursor));
        await this.onComplete(pages);
        this.complete = true;
        return pages;
      })();
      return this.done;
    }
  }

  class PreviewCache {
    constructor({ limit = CONFIG.hoverCacheEntries, maxBytes = CONFIG.hoverCacheBytes,
      lifetime = THUMBNAIL_LIFETIME, urls = URL, now = Date.now } = {}) {
      Object.assign(this, { limit, maxBytes, lifetime, urls, now });
      this.entries = new Map();
      this.bytes = 0;
    }
    get(key) {
      const entry = this.entries.get(key);
      if (!entry) return null;
      if (this.now() - entry.savedAt >= this.lifetime) { this.delete(key); return null; }
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.url;
    }
    put(key, blob, savedAt = this.now()) {
      if (blob.size > this.maxBytes) throw localizedUiError('previewTooLarge');
      this.delete(key);
      const url = this.urls.createObjectURL(blob);
      this.entries.set(key, { url, bytes: blob.size, savedAt });
      this.bytes += blob.size;
      while (this.entries.size > this.limit || this.bytes > this.maxBytes) this.delete(this.entries.keys().next().value);
      return url;
    }
    delete(key) {
      const entry = this.entries.get(key);
      if (!entry) return;
      this.entries.delete(key);
      this.bytes -= entry.bytes;
      this.urls.revokeObjectURL(entry.url);
    }
    clear() { for (const key of this.entries.keys()) this.delete(key); }
  }

  function previewScope(key) {
    try {
      const parts = JSON.parse(key);
      return Array.isArray(parts) && parts.length === 4 && typeof parts[0] === 'string' &&
        typeof parts[1] === 'string' ? parts[0] : null;
    } catch { return null; }
  }

  function previewKey(scope, reference) {
    return JSON.stringify([scope, reference.id, reference.asset_pointer, reference.thumbnail_asset_pointer]);
  }

  function validPreview(record, policy) {
    return Boolean(record && typeof record.scope === 'string' && record.scope === previewScope(record.key) && fresh(record, policy.lifetime, policy.now()) &&
      record.blob instanceof Blob && /^image\//i.test(record.blob.type) && record.blob.size > 0 && record.blob.size <= policy.maxEntryBytes);
  }

  const PREVIEW_PROCESSING = `fit-${CONFIG.hoverMaxWidth}x${CONFIG.hoverMaxHeight}-medium-v1`;

  async function resizePreview(blob, { decode = value => createImageBitmap(value),
    createCanvas = () => document.createElement('canvas') } = {}) {
    const bitmap = await decode(blob);
    try {
      const size = fitPreviewDimensions(bitmap.width, bitmap.height);
      if (!size) throw new Error('Invalid preview dimensions');
      const width = Math.max(1, Math.round(size.width)), height = Math.max(1, Math.round(size.height));
      if (width === bitmap.width && height === bitmap.height) return { blob, width, height };
      const canvas = createCanvas();
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Preview canvas unavailable');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'medium';
      // Draw the entire source; unlike menu avatars, previews must not be cropped.
      context.drawImage(bitmap, 0, 0, width, height);
      const resized = await new Promise((resolve, reject) => canvas.toBlob(value => {
        if (value) resolve(value); else reject(new Error('Preview encoding failed'));
      }, 'image/webp', 0.8));
      return { blob: resized, width, height };
    } finally { bitmap.close(); }
  }

  function processedPreview(record) {
    return record.processing === PREVIEW_PROCESSING && Number.isInteger(record.width) && record.width > 0 &&
      record.width <= CONFIG.hoverMaxWidth && Number.isInteger(record.height) && record.height > 0 && record.height <= CONFIG.hoverMaxHeight;
  }

  // Persistent Blobs are independent of the document-local object URLs used to display them.
  class PersistentPreviewCache {
    constructor(storage, { scope, resize = resizePreview, diskLimit = CONFIG.hoverDiskEntries, diskMaxBytes = CONFIG.hoverDiskBytes, ...options }) {
      this.storage = storage;
      this.scope = scope;
      this.resize = resize;
      this.memory = new PreviewCache(options);
      this.disk = { limit: diskLimit, maxBytes: diskMaxBytes, maxEntryBytes: Math.min(this.memory.maxBytes, diskMaxBytes),
        lifetime: this.memory.lifetime, now: this.memory.now };
      this.reads = new Map();
      this.writes = new Map();
      this.invalidated = new Set();
      this.versions = new Map();
      this.generation = 0;
      this.pending = Promise.resolve();
      this.backgroundWrites = 0;
      this.protectedKeys = new Set();
      this.protectionReady = true;
      this.onRemoved = () => {};
      this.onReady = () => {};
      this.accessWrites = new AccessWriteBatch(batch => this.enqueue(() => storage.request('previews', 'readwrite', table => {
        for (const [key, accessedAt] of batch) {
          const request = table.get(key);
          request.onsuccess = () => {
            const record = request.result;
            if (validPreview(record, this.disk) && record.accessedAt < accessedAt) table.put({ ...record, accessedAt });
          };
        }
      })));
    }
    get entries() { return this.memory.entries; }
    get bytes() { return this.memory.bytes; }
    enqueue(task) {
      const next = this.pending.then(task);
      this.pending = next.catch(() => {});
      return next;
    }
    async get(key, signal) {
      signal?.throwIfAborted();
      const scope = previewScope(key);
      if (!scope || scope !== this.scope() || this.invalidated.has(key)) return null;
      const cached = this.memory.get(key);
      if (cached) { this.accessWrites.touch(key, this.memory.now()); return cached; }
      const generation = this.generation;
      while (this.writes.has(key)) {
        const write = this.writes.get(key);
        const prepared = write.record ? { record: write.record, version: write.version } :
          await waitWithSignal(write.ready, signal).catch(error => {
            if (signal?.aborted && error?.name === 'AbortError') throw error;
            return null;
          });
        if (generation !== this.generation || scope !== this.scope() || this.invalidated.has(key)) return null;
        if (prepared && prepared.version === (this.versions.get(key) || 0)) return this.remember(prepared.record);
        if (this.writes.get(key) === write) break;
      }
      const version = this.versions.get(key) || 0;
      const loaded = await this.read(key, signal).catch(error => { if (error?.name === 'AbortError') throw error; return null; });
      if (!loaded || generation !== this.generation || version !== (this.versions.get(key) || 0)) return null;
      return this.remember(loaded.record);
    }
    remember(record) {
      if (previewScope(record.key) !== this.scope() || !validPreview(record, this.disk)) throw new DOMException('Preview account changed', 'AbortError');
      const cached = this.memory.get(record.key);
      const url = cached || this.memory.put(record.key, record.blob, record.savedAt);
      this.accessWrites.prime(record.key, record.accessedAt);
      this.accessWrites.touch(record.key, this.memory.now());
      return url;
    }
    async read(key, signal) {
      signal?.throwIfAborted();
      const scope = previewScope(key);
      if (!scope || scope !== this.scope() || this.invalidated.has(key)) return null;
      let read = this.reads.get(key);
      if (!read) {
        const generation = this.generation, version = this.versions.get(key) || 0;
        const current = () => generation === this.generation && scope === this.scope() && version === (this.versions.get(key) || 0);
        read = this.storage.get('previews', key).catch(error => { error.cacheStorageFailure = true; error.cacheStorageOperation = 'read'; throw error; }).then(async record => {
          if (!current()) return null;
          if (!record) return null;
          if (!validPreview(record, this.disk)) { this.delete(key); return null; }
          let committed = Promise.resolve(true);
          if (!processedPreview(record)) {
            let resized;
            try { resized = await this.resize(record.blob); }
            catch (error) { if (current()) this.delete(key); throw error; }
            if (!current()) return null;
            record = { ...record, ...resized, processing: PREVIEW_PROCESSING };
            if (!validPreview(record, this.disk) || !processedPreview(record)) { this.delete(key); return null; }
            committed = this.persist(record, version);
          }
          committed.then(() => { if (current()) this.onReady(record); }).catch(() => {});
          return { record, committed };
        }).finally(() => {
          if (this.reads.get(key) === read) this.reads.delete(key);
        });
        this.reads.set(key, read);
      }
      return waitWithSignal(read, signal);
    }
    async put(key, blob, savedAt = this.memory.now(), signal) {
      const { record, version } = await this.prepare(key, blob, savedAt, signal);
      try {
        const url = this.remember(record);
        this.persist(record, version);
        return url;
      } catch (error) {
        if (this.writes.get(key)?.version === version) this.writes.delete(key);
        throw error;
      }
    }
    async store(key, blob, signal) {
      const { record, version } = await this.prepare(key, blob, this.memory.now(), signal);
      return { record, committed: this.persist(record, version, true) };
    }
    async prepare(key, blob, savedAt, signal) {
      signal?.throwIfAborted();
      const scope = previewScope(key), generation = this.generation;
      if (!scope || scope !== this.scope() || !(blob instanceof Blob) || !/^image\//i.test(blob.type) || !blob.size) throw new Error('Invalid large preview');
      const version = (this.versions.get(key) || 0) + 1;
      this.versions.set(key, version);
      const write = { version, record: null, ready: null };
      this.writes.set(key, write);
      write.ready = (async () => {
        const resized = await this.resize(blob);
        signal?.throwIfAborted();
        if (generation !== this.generation || scope !== this.scope() || version !== this.versions.get(key)) {
          throw new DOMException('Preview superseded', 'AbortError');
        }
        const record = { key, scope, savedAt, accessedAt: savedAt, ...resized, processing: PREVIEW_PROCESSING };
        if (!scope || scope !== this.scope() || !validPreview(record, this.disk)) throw new Error('Invalid large preview');
        if (!processedPreview(record)) throw new Error('Invalid resized preview');
        this.invalidated.delete(key);
        write.record = record;
        return { record, version };
      })();
      write.ready.catch(() => {
        if (this.writes.get(key) === write) this.writes.delete(key);
      });
      return write.ready;
    }
    persist(record, version, background = false) {
      const generation = this.generation;
      const committed = this.enqueue(async () => {
        if (generation !== this.generation || (this.versions.get(record.key) || 0) !== version || this.invalidated.has(record.key)) throw new DOMException('Preview superseded', 'AbortError');
        try { await this.storage.put('previews', record); }
        catch (error) { error.cacheStorageFailure = true; error.cacheStorageOperation = 'write'; throw error; }
        if (generation === this.generation && (this.versions.get(record.key) || 0) === version) this.onReady(record);
        // Maintenance failure is reported by Storage, but the image commit succeeded.
        if (!background || !this.protectedKeys.has(record.key) || (this.protectionReady && ++this.backgroundWrites % 32 === 0)) {
          const cleanup = this.prune === PersistentPreviewCache.prototype.prune ? () => this.pruneNow() : () => this.prune();
          await cleanup().catch(() => {});
        }
        return true;
      }).finally(() => {
        if (this.writes.get(record.key)?.version === version) this.writes.delete(record.key);
      });
      committed.catch(() => {});
      return committed;
    }
    delete(key) {
      this.memory.delete(key);
      this.writes.delete(key);
      this.versions.set(key, (this.versions.get(key) || 0) + 1);
      this.invalidated.add(key);
      this.onRemoved([key]);
      void this.enqueue(() => this.storage.delete('previews', key)).catch(() => {});
    }
    clear() {
      this.generation++;
      this.memory.clear();
      this.reads.clear();
      this.writes.clear();
      void this.accessWrites.flush();
      this.accessWrites.clear();
    }
    pruneNow() {
      const removed = [];
      return this.storage.request('previews', 'readwrite', table => {
        const request = table.getAll();
        request.onsuccess = () => {
          const valid = [];
          for (const record of request.result || []) {
            if (validPreview(record, this.disk)) valid.push(record);
            else { removed.push(record.key); table.delete(record.key); }
          }
          valid.sort((a, b) => (a.accessedAt || a.savedAt) - (b.accessedAt || b.savedAt));
          let bytes = valid.reduce((sum, record) => sum + record.blob.size, 0), count = valid.length;
          for (const record of valid) {
            if (!this.protectionReady) break;
            if (count <= this.disk.limit && bytes <= this.disk.maxBytes) break;
            if (this.protectedKeys.has(record.key)) continue;
            removed.push(record.key); table.delete(record.key); count--; bytes -= record.blob.size;
          }
        };
      }).then(() => { if (removed.length) this.onRemoved(removed); return removed; });
    }
    prune() {
      return this.enqueue(() => this.pruneNow());
    }
  }

  class HoverPreview {
    constructor({ load, resolve, show, hide, current, cache = new PreviewCache(), delay = CONFIG.hoverDelayMs }) {
      Object.assign(this, { load, resolve, show, hide, current, cache, delay });
      this.target = null;
    }
    open(key, reference, context) {
      if (this.target?.key === key && this.target.context.row === context.row) return;
      this.close();
      const target = { key, reference, context, controller: new AbortController() };
      this.target = target;
      target.timer = setTimeout(() => { void this.run(target); }, this.delay);
    }
    valid(target) { return this.target === target && !target.controller.signal.aborted && this.current(target.context); }
    async run(target) {
      if (!this.valid(target)) { if (this.target === target) this.close(); return; }
      const display = (status, url = null) => this.show({ ...target, status, url });
      try {
        display('loading');
        if (this.resolve) {
          const url = await this.resolve(target.key, target.reference, target.controller.signal, target.context);
          if (this.valid(target)) display('ready', url);
          return;
        }
        let url = await this.cache.get(target.key, target.controller.signal);
        if (!this.valid(target)) return;
        if (!url) {
          const blob = await this.load(target.reference, target.controller.signal, target.context);
          if (!this.valid(target)) return;
          url = await this.cache.put(target.key, blob, undefined, target.controller.signal);
        }
        if (this.valid(target)) display('ready', url);
      } catch (error) {
        if (error?.name !== 'AbortError') { if (this.valid(target)) display('error'); return; }
        // A store "superseded" by another writer of the same preview: show what that writer stored.
        const stored = this.valid(target) && !target.context?.stored ?
          await Promise.resolve().then(() => this.cache.get(target.key, target.controller.signal)).catch(() => null) : null;
        if (stored && this.valid(target)) display('ready', stored);
        else if (this.target === target) this.close();
      }
    }
    close() {
      if (this.target) {
        clearTimeout(this.target.timer);
        this.target.controller.abort();
        this.target = null;
      }
      this.hide();
    }
  }

  function fitPreviewDimensions(width, height, maxWidth = CONFIG.hoverMaxWidth, maxHeight = CONFIG.hoverMaxHeight) {
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return null;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    return { width: width * scale, height: height * scale };
  }

  function previewImageSize(width, height, viewport, maxWidth = CONFIG.hoverMaxWidth, maxHeight = CONFIG.hoverMaxHeight) {
    return fitPreviewDimensions(width, height, Math.min(maxWidth, Math.max(1, viewport.width - 38)),
      Math.min(maxHeight, Math.max(1, viewport.height - 110)));
  }

  function previewPosition(row, menu, panel, viewport, cursor = null) {
    const gap = 10, margin = 8;
    const right = viewport.width - menu.right - gap;
    const left = menu.left - gap;
    let x = right >= panel.width || right >= left ? menu.right + gap : menu.left - gap - panel.width;
    let y = row.top;
    if (cursor) {
      x = cursor.x + 16;
      y = cursor.y + 16;
      if (x + panel.width > viewport.width - margin) x = cursor.x - 16 - panel.width;
      if (y + panel.height > viewport.height - margin) y = cursor.y - 16 - panel.height;
    }
    return {
      left: Math.max(margin, Math.min(x, viewport.width - panel.width - margin)),
      top: Math.max(margin, Math.min(y, viewport.height - panel.height - margin)),
    };
  }

  if (typeof window === 'undefined' && typeof module === 'object' && module !== null && module.exports) {
    module.exports = { CONFIG, UI_MESSAGES, UI_ICONS, ReferenceFocusGate, renderUiStatus, glyphPosition, resolveUiLocale, uiLocale, translateUi, matchesSearch, searchWords, fileKey, pointerFileHex, contentKey, scopeKey, scopeOwner, verifiedOwner, cleanReference, fresh, validThumbnail, catalogBody, createCatalogSnapshot, detachedDownload, boundedImage, thumbnailMatchesReference, menuAvatarRequest, cleanRequestHeaders, referenceTransport, mergeReference, rowFiberInfo, isLibraryMenuItem, nativeSelection, nativeCatalog, referenceButton, referenceStatus, referenceNotice, referenceRefreshState, ReferenceClickGate, patchReactProps, REFERENCE_HOVER_EVENTS, mentionReferenceId, mentionHighlighted, highlightedMention, mentionImagePointers, referenceOwner, mentionIconBox, referencePill, RecentMisses, ReferenceIndex, DownloadQueue, ThumbnailInventory, SharedImages, PreviewLoader, ChatCacheSession, chatIdFor, conversationIdFromPath, deletedChatId, CHAT_CACHE_PREFIX, CHAT_CACHE_RECENT_KEY, AccessWriteBatch, MenuRows, CatalogSession, waitWithSignal, PreviewCache, PersistentPreviewCache, HoverPreview, resizePreview, previewImageSize, previewPosition };
    return;
  }
  if (window.top !== window || window.__referenceMenuFastInstalled) return;
  window.__referenceMenuFastInstalled = true;

  class Storage {
    constructor() {
      this.errors = new Map();
      this.settled = new Map();
      this.retries = new Map();
      this.readChecks = new Set();
      this.sequence = 0;
      this.lastFailure = null;
      // One connection at a time. A failed open, a newer schema elsewhere or a browser-closed connection
      // is reopened lazily by the next request and by a backed-off background probe.
      this.db = null; this.opening = null; this.openError = null; this.retryAt = 0;
      this.lost = false; this.reopenDelay = 0; this.reopenTimer = null; this.reconnects = 0; this.onReconnect = null;
      // Unavailable storage must not stop ChatGPT from loading.
      this.connect().catch(() => {});
    }

    openDatabase() {
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, db) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(db);
        };
        const timer = setTimeout(() => finish(new DOMException('Cache database open timed out', 'TimeoutError')),
          CONFIG.storageTimeoutSeconds * 1000);
        let request;
        try { request = indexedDB.open('chatgpt-reference-menu-fast-v1', 2); }
        catch (error) { finish(error); return; }
        request.onupgradeneeded = event => {
          if (settled) { request.transaction.abort(); return; }
          if ((event?.oldVersion || 0) < 1) {
            request.result.createObjectStore('catalogs', { keyPath: 'key' });
            const thumbnails = request.result.createObjectStore('thumbnails', { keyPath: 'key' });
            thumbnails.createIndex('accessedAt', 'accessedAt');
          }
          if ((event?.oldVersion || 0) < 2) request.result.createObjectStore('previews', { keyPath: 'key' });
        };
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { db.close(); return; }
          db.onversionchange = () => { db.close(); this.disconnect(db); };
          db.onclose = () => this.disconnect(db);
          finish(null, db);
        };
        request.onerror = () => finish(request.error || new Error('Cache database open failed'));
        request.onblocked = () => finish(new Error('Cache database blocked'));
      });
    }

    // Requests inside the backoff window fail fast with the last open error; the probe (`probe`) ignores it.
    connect(probe = false) {
      if (this.db) return Promise.resolve(this.db);
      if (this.opening) return this.opening;
      if (!probe && this.openError && Date.now() < this.retryAt) return Promise.reject(this.openError);
      this.opening = this.openDatabase().then(db => {
        this.opening = null; this.db = db; this.openError = null; this.reopenDelay = 0;
        clearTimeout(this.reopenTimer); this.reopenTimer = null;
        if (this.lost) { this.lost = false; this.reconnects += 1; this.onReconnect?.(); }
        return db;
      }, error => {
        this.opening = null;
        error.cacheConnectionFailure = true;
        this.openError = error; this.lost = true;
        this.reopenDelay = Math.min(this.reopenDelay ? this.reopenDelay * 2 : CONFIG.storageReopenSeconds * 1000,
          CONFIG.storageReopenMaxSeconds * 1000);
        this.retryAt = Date.now() + this.reopenDelay;
        this.scheduleReopen(this.reopenDelay);
        throw error;
      });
      return this.opening;
    }

    disconnect(db) {
      if (this.db !== db) return;
      this.db = null; this.lost = true; this.openError = null; this.retryAt = 0;
      // The next request reopens at once; the probe recovers paused caching when nothing else asks.
      this.scheduleReopen(CONFIG.storageReopenSeconds * 1000);
    }

    scheduleReopen(delay) {
      if (this.reopenTimer !== null) return;
      this.reopenTimer = setTimeout(() => { this.reopenTimer = null; this.connect(true).catch(() => {}); }, delay);
      this.reopenTimer?.unref?.();
    }

    get lastError() { return [...this.errors.values()].at(-1)?.info || null; }
    get checkingReads() { return this.retries.size > 0 || this.readChecks.size > 0; }

    finishOperation(operation, sequence, error = null) {
      // A delayed result from an older request must not replace a newer health check.
      if ((this.settled.get(operation) || 0) > sequence) return false;
      this.settled.set(operation, sequence);
      clearTimeout(this.retries.get(operation));
      this.retries.delete(operation);
      const previous = this.errors.delete(operation);
      if (error) {
        const info = { operation, reason: error?.name === 'TimeoutError' ? 'timeout' :
          error?.cacheConnectionFailure ? 'unavailable' : 'storage-error' };
        this.errors.set(operation, { sequence, info });
        this.lastFailure = info;
      }
      if (previous || error) updateProgress();
      return true;
    }

    async request(store, mode, action, retryRead = true) {
      const operation = `${store}:${mode}`, sequence = ++this.sequence;
      try {
        const db = await this.connect();
        let transaction;
        try { transaction = db.transaction(store, mode); }
        catch (error) {
          // A connection the browser is closing can no longer start transactions.
          if (error?.name === 'InvalidStateError') { error.cacheConnectionFailure = true; this.disconnect(db); }
          throw error;
        }
        const result = await new Promise((resolve, reject) => {
          let request, settled = false;
          const finish = error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) {
              if (this.db !== db && error && typeof error === 'object') error.cacheConnectionFailure = true;
              reject(error);
            } else resolve(request?.result);
          };
          const abort = error => {
            finish(error);
            try { transaction.abort(); } catch { /* Already finished. */ }
          };
          const timer = setTimeout(() => abort(new DOMException('Cache transaction timed out', 'TimeoutError')),
            CONFIG.storageTimeoutSeconds * 1000);
          transaction.oncomplete = () => finish();
          transaction.onerror = () => finish(transaction.error || new Error('Cache transaction failed'));
          transaction.onabort = () => finish(transaction.error || new Error('Cache transaction aborted'));
          try { request = action(transaction.objectStore(store)); }
          catch (error) { abort(error); }
        });
        this.finishOperation(operation, sequence);
        return result;
      } catch (error) {
        if (this.finishOperation(operation, sequence, error) && mode === 'readonly' && retryRead) {
          // Recheck the exact failed read once, independently of the server fallback.
          // Never replay writes or retry indefinitely while storage remains unavailable.
          const retry = setTimeout(() => {
            this.retries.delete(operation);
            if (this.errors.get(operation)?.sequence === sequence) {
              this.readChecks.add(sequence);
              updateProgress();
              this.request(store, mode, action, false).catch(() => {}).finally(() => {
                this.readChecks.delete(sequence);
                updateProgress();
              });
            }
          }, CONFIG.storageReadRetryMs);
          retry?.unref?.();
          this.retries.set(operation, retry);
        }
        throw error;
      }
    }

    get(store, key) { return this.request(store, 'readonly', table => table.get(key)); }
    put(store, value) { return this.request(store, 'readwrite', table => table.put(value)); }
    delete(store, key) { return this.request(store, 'readwrite', table => table.delete(key)); }

    async prune(protectedKeys = new Set(), maxThumbnails = CONFIG.maxThumbnails) {
      const removed = [];
      await this.request('thumbnails', 'readwrite', table => {
        const request = table.getAll();
        request.onsuccess = () => {
          const valid = [];
          for (const record of request.result || []) {
            if (usableThumbnail(record)) valid.push(record);
            else { removed.push(record.key); table.delete(record.key); }
          }
          valid.sort((a, b) => (a.accessedAt || a.savedAt) - (b.accessedAt || b.savedAt));
          let extra = Math.max(0, valid.length - Math.max(maxThumbnails, protectedKeys.size));
          for (const record of valid) {
            if (extra <= 0) break;
            if (protectedKeys.has(record.key)) continue;
            removed.push(record.key);
            table.delete(record.key);
            extra--;
          }
        };
      });
      return removed;
    }
  }

  // Catalog pages, incremental indexes and memory snapshots.
  class CatalogController {
    constructor() {
      this.index = new ReferenceIndex();
      this.collectedSessions = new Map(); // Last collection per scope, for the page count shown in the status.
      this.records = new Map();
      this.sessions = new Map();
      this.indexed = null;
      this.published = new WeakMap();
      this.publishing = new WeakMap();
    }
    indexReferences(items, complete) {
      const changes = this.index.apply(items, complete);
      if (!changes.changed) return;
      for (const state of mountedMenus.values()) {
        if (state.dirtyIds) for (const id of changes.ids) state.dirtyIds.add(id);
        if (state.dirtyNames) for (const name of changes.names) state.dirtyNames.add(name);
      }
      schedule();
    }

    clearReferenceIndex() {
      for (const state of mountedMenus.values()) {
        if (state.dirtyIds) for (const id of referencesById.keys()) state.dirtyIds.add(id);
        if (state.dirtyNames) for (const name of referencesByName.keys()) state.dirtyNames.add(name);
      }
      this.index.clear();
      schedule();
    }

    registerReferences(scope, items, complete = false, retrySet = null) {
      if (activeScope !== scope) return;
      inventory.register(items);
      this.indexReferences(items, complete);
      if (complete) inventory.finish(items);
      this.cacheReferences(scope, items, retrySet);
      if (complete && cacheAllowed()) previewLoader.finish(scope, items);
      updateProgress();
    }

    cacheReferences(scope, items, retrySet = null) {
      if (!cacheAllowed()) return;
      if (activeScope !== scope) return;
      const transport = activeTransport;
      const processed = new Set();
      if (transport?.scope === scope) for (const reference of items) {
        const file = referenceFile(reference);
        if (!file) continue;
        referenceSources.set(file, { reference, transport });
        if (processed.has(file)) { previewLoader.register(scope, reference, transport, retrySet); continue; }
        processed.add(file);
        const key = JSON.stringify([scope, file]);
        if (retrySet && !retrySet.has(key)) {
          retrySet.add(key);
          if (!storageWriteFailed && !thumbnailLoader.storageFailed.has(key)) thumbnailFailed.delete(key);
        }
        const cached = thumbnailMemory.get(key);
        if (cached?.persisted && usableThumbnail(cached)) {
          thumbnailCompleted.add(key);
          inventory.mark(file, 'ready');
        } else if (thumbnailFailed.has(key)) inventory.mark(file, 'failed');
        else queueThumbnail(scope, file, signal => downloadReference(reference, transport, signal));
        previewLoader.register(scope, reference, transport, retrySet);
      }
      updateProgress();
    }

    startCatalogSession(transport, firstPage, { preserveSnapshot = false, restart = false, provisional = false } = {}) {
      if (!cacheAllowed()) return null;
      let scope = transport.scope;
      const [, accountKey] = JSON.parse(scope);
      const existing = this.sessions.get(scope);
      if (!restart && !firstPage && sessionRunning(existing)) return existing;
      existing?.controller.abort();
      if (!preserveSnapshot) {
        inventory.reset();
        thumbnailFailed.clear();
        thumbnailLoader.storageFailed.clear();
        this.indexed = null;
        this.clearReferenceIndex();
      }
      catalogError = false;
      const retrySet = restart || !preserveSnapshot ? new Set() : null;
      const session = new CatalogSession({
        owner: JSON.parse(scope)[0],
        provisional: provisional || Boolean(transport.provisional),
        onOwner: nextOwner => {
          transport.provisional = false;
          const nextScope = scopeKey(nextOwner, accountKey);
          if (!nextScope || nextScope === scope) return;
          const oldScope = scope;
          scope = nextScope;
          if (transport === activeTransport || transport.scope === oldScope) transport.scope = nextScope;
          this.sessions.delete(oldScope);
          this.collectedSessions.delete(oldScope);
          this.records.delete(oldScope);
          safely(storage.delete('catalogs', oldScope));
          if (activeScope === oldScope) {
            const promotingTransport = activeTransport;
            setScope(nextScope);
            activeTransport = promotingTransport;
          }
          this.sessions.set(nextScope, session);
          this.collectedSessions.set(nextScope, session);
        },
        request: (cursor, signal) => transport.api.list(cursor, signal),
        timeout: CONFIG.requestTimeoutSeconds * 1000,
        onPage: items => preserveSnapshot ? this.cacheReferences(scope, items, retrySet) : this.registerReferences(scope, items, false, retrySet),
        onComplete: async pages => {
          session.controller.signal.throwIfAborted();
          if (activeScope !== scope) return;
          const record = { key: scope, savedAt: Date.now(), pages,
            identity: transport.identity ?? this.records.get(scope)?.identity ?? null };
          this.records.set(scope, record);
          // Metadata is complete when the final page arrives, independently of disk persistence.
          this.indexed = record;
          this.registerReferences(scope, pages.flatMap(page => page.items), true, retrySet);
          if (preserveSnapshot || restart) this.publish(record, scope);
          safely(storage.request('catalogs', 'readwrite', table => {
            if (!session.controller.signal.aborted && activeScope === scope) return table.put(record);
          }));
        },
      });
      session.servingSnapshot = preserveSnapshot;
      // Native menu requests waiting on the cancelled session follow this replacement.
      if (restart && existing) existing.replacement = session;
      this.sessions.set(scope, session);
      this.collectedSessions.set(scope, session);
      updateProgress();
      if (firstPage) safely(session.prime(null, firstPage));
      safely(session.start().catch(() => {
        session.failed = true;
        if (activeScope === scope && this.sessions.get(scope) === session && !session.controller.signal.aborted) catalogError = true;
      }).finally(() => { updateProgress(); }));
      return session;
    }

    refreshIfDue(transport, firstPage = null) {
      if (!cacheAllowed() || transport?.scope !== activeScope) return null;
      const existing = this.sessions.get(transport.scope);
      if (sessionRunning(existing)) return existing;
      const record = this.records.get(transport.scope);
      if (fresh(record, CONFIG.catalogRefreshMinutes * 60 * 1000)) return null;
      return this.startCatalogSession(transport, firstPage, { preserveSnapshot: Boolean(this.indexed) });
    }

    async cachedForAccount(account, identity) {
      if (activeScope && activeAccount === account) {
        const known = await this.loadCatalog(activeScope, false);
        if (known) return known;
      }
      if (!identity) return null;
      const matches = record => {
        try {
          const [owner, storedAccount] = JSON.parse(record.key);
          const items = record.pages.flatMap(page => page.items);
          return storedAccount === (account || 'server-verified') && record.identity === identity &&
            fresh(record, CONFIG.catalogHours * HOUR) && (!items.length || verifiedOwner(items) === owner) &&
            items.every(item => cleanReference(item));
        } catch { return false; }
      };
      let record = [...this.records.values()].find(matches);
      if (!record) record = (await storage.request('catalogs', 'readonly', table => table.getAll()).catch(() => []) || []).find(matches);
      if (record) this.records.set(record.key, record);
      return record || null;
    }

    refreshOnOpen() {
      syncChatRoute();
      // Opening this chat's reference menu replaces the removed start button.
      if (cacheSession.chatId) cacheSession.begin();
      const scope = activeScope, transport = activeTransport, epoch = catalogEpoch;
      if (!cacheAllowed() || !scope || transport?.scope !== scope || catalogBarrier) return;
      // The app can reopen its own query cache without issuing another fetch.
      queueMicrotask(() => {
        if (activeScope !== scope || catalogEpoch !== epoch) return;
        safely(this.refreshIfDue(transport)?.done);
      });
    }

    publish(record, scope) {
      if (activeScope !== scope || this.records.get(scope) !== record) return;
      for (const state of mountedMenus.values()) {
        const node = state.menu.querySelector('[role="menuitem"]') || state.menu;
        const bridge = nativeCatalog(node, activeAccount);
        if (!bridge || this.published.get(bridge.query) === record || this.publishing.get(bridge.query) === record) continue;
        const apply = () => {
          if (!state.menu.isConnected || activeScope !== scope || this.records.get(scope) !== record ||
              (activeAccount !== null && bridge.query.queryKey[1] !== activeAccount) || bridge.query.queryKey[2] !== bridge.cacheKey) return;
          this.published.set(bridge.query, record);
          try { bridge.scope.queryClient.setQueryData(bridge.query.queryKey, record.pages.flatMap(page => page.items)); }
          catch { /* A changed app bridge can still consume the fresh snapshot on the next open. */ }
        };
        if (bridge.query.state.fetchStatus === 'fetching') {
          if (!bridge.query.promise?.then) continue;
          this.publishing.set(bridge.query, record);
          safely(Promise.resolve(bridge.query.promise).catch(() => {}).then(() => {
            if (this.publishing.get(bridge.query) === record) this.publishing.delete(bridge.query);
            apply();
          }));
        } else apply();
      }
    }

    async loadCatalog(scope, activate = true) {
      let record = this.records.get(scope);
      if (!record) {
        record = await storage.get('catalogs', scope).catch(() => null);
        if (record) this.records.set(scope, record);
      }
      if (!fresh(record, CONFIG.catalogHours * HOUR)) return null;
      if (activate && activeScope === scope && this.indexed !== record) {
        this.indexed = record;
        this.registerReferences(scope, record.pages.flatMap(page => page.items), true);
      }
      return record;
    }

    async invalidate(scope) {
      dropCatalogScope(scope, { local: true });
      await storage.delete('catalogs', scope).catch(() => {});
      channel?.postMessage({ type: 'invalidate', scope });
    }
  }

  // Persistent thumbnails and batched access timestamps.
  class ThumbnailCache {
    constructor(storage) {
      this.storage = storage;
      this.memory = new Map();
      this.load = Promise.resolve();
      this.writeCount = 0;
      this.accessWrites = new AccessWriteBatch(batch => this.storage.request('thumbnails', 'readwrite', table => {
        for (const [key, accessedAt] of batch) {
          const request = table.get(key);
          request.onsuccess = () => {
            const record = request.result;
            if (record && usableThumbnail(record) && record.accessedAt < accessedAt) {
              table.put({ ...record, accessedAt });
            }
          };
        }
      }));
    }
    activate(scope) {
      this.accessWrites.clear();
      this.memory.clear();
      this.loadFailed = null;
      this.load = scope ? this.readScope(scope) : Promise.resolve();
    }

    // One read replaces thousands of individual IndexedDB lookups while opening a menu.
    readScope(scope) {
      return this.storage.request('thumbnails', 'readonly', table => table.getAll()).then(records => {
        if (activeScope !== scope) return;
        this.loadFailed = null;
        for (const record of records || []) {
          let owner;
          try { [owner] = JSON.parse(record.key); } catch { continue; }
          if (owner === scope && usableThumbnail(record) && !this.memory.has(record.key)) {
            this.memory.set(record.key, { ...record, persisted: true });
            this.accessWrites.prime(record.key, record.accessedAt);
          }
        }
        // Settle already-queued unstarted tasks for cached thumbnails immediately without dirtying accessedAt.
        for (const [key, task] of [...thumbnailTasks]) {
          if (task.scope !== scope || task.started) continue;
          const record = this.memory.get(key);
          if (!usableThumbnail(record)) continue;
          task.controller.abort();
          thumbnailTasks.delete(key);
          for (const job of pendingRequests) {
            if (job.scope === scope && job.file === task.file) job.cachedKey = key;
          }
          thumbnailCompleted.add(key);
          inventory.mark(task.file, 'ready');
          paintFile(task.file, record);
        }
        updateProgress();
        composerMentions.paintIcons();
      }).catch(() => { if (activeScope === scope) this.loadFailed = scope; });
    }

    reloadAfterReconnect() {
      if (this.loadFailed && this.loadFailed === activeScope) this.load = this.readScope(activeScope);
    }

    async pruneThumbnails() {
      const protectedKeys = new Set([...inventory.items.values()].filter(item => item.file).map(item => JSON.stringify([activeScope, item.file])));
      const removed = await this.storage.prune(protectedKeys);
      for (const key of removed || []) {
        this.memory.delete(key);
        thumbnailCompleted.delete(key);
        const [scope, file] = JSON.parse(key);
        if (scope === activeScope) {
          inventory.mark(file, 'pending');
          const source = referenceSources.get(file);
          if (source) queueThumbnail(scope, file, signal => downloadReference(source.reference, source.transport, signal));
        }
      }
      updateProgress();
    }

    async cachedThumbnail(key) {
      await this.load;
      const record = this.memory.get(key);
      if (!usableThumbnail(record)) return null;
      this.touch(record);
      return record;
    }

    touch(record) {
      record.accessedAt = Date.now();
      this.accessWrites.touch(record.key, record.accessedAt);
    }

    async saveThumbnail(scope, file, response, signal) {
      signal?.throwIfAborted();
      if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')) return;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      let dataUrl;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = CONFIG.thumbnailSize;
        canvas.height = CONFIG.thumbnailSize;
        const context = canvas.getContext('2d');
        if (!context || !bitmap.width || !bitmap.height) return;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'medium';
        const crop = Math.min(bitmap.width, bitmap.height);
        context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/webp', 0.8);
      } finally {
        bitmap.close();
      }
      signal?.throwIfAborted();
      if (activeScope !== scope) return;
      const key = JSON.stringify([scope, file]);
      const record = { key, savedAt: Date.now(), accessedAt: Date.now(), dataUrl };
      if (!validThumbnail(record)) return;
      try { await this.storage.put('thumbnails', record); }
      catch (error) { error.cacheStorageFailure = true; throw error; }
      signal?.throwIfAborted();
      if (activeScope !== scope) return;
      record.persisted = true;
      this.memory.set(key, record);
      storedThumbnails.knownKeys.add(key);
      storedThumbnails.misses.delete(key);
      this.accessWrites.prime(key, record.accessedAt);
      statistics.cachedThumbnails += 1;
      if (++this.writeCount % 32 === 0) safely(this.pruneThumbnails());
      if (activeScope === scope) {
        paintFile(file, record);
        composerMentions.paintIcons();
      }
    }
  }

  // Independent thumbnail work; closing a menu does not cancel this service.
  class ThumbnailLoader {
    constructor() {
      this.downloads = new DownloadQueue(CONFIG.concurrentDownloads, CONFIG.backgroundDownloads);
      this.sharedImages = new SharedImages();
      this.sources = new Map();
      this.pending = new Set();
      this.tasks = new Map();
      this.completed = new Set();
      this.failed = new Set();
      this.storageFailed = new Set(); // Keys failed only because cache storage could not be written.
      this.visibleFiles = new Set();
      this.scheduled = false;
    }
    async downloadReference(reference, transport, signal) {
      const file = referenceFile(reference);
      return this.sharedImages.get(JSON.stringify([transport.scope, file]), s => this.fetchReference(reference, transport, s), signal);
    }
    async fetchReference(reference, transport, signal) {
      const response = await boundedImage(s => transport.api.verify(reference.id, s), CONFIG.requestTimeoutSeconds * 1000, signal);
      if (!response.ok) { const error = new Error('Reference thumbnail lookup failed'); error.retryable = response.status >= 500; throw error; }
      const body = await response.json();
      if (!thumbnailMatchesReference(body.thumbnail_url, reference)) throw new Error('Reference thumbnail binding changed');
      signal?.throwIfAborted();
      if (activeScope === transport.scope && !inventory.known && !inventory.items.has(reference.id)) {
        inventory.register([reference]); updateProgress();
      }
      const image = await boundedImage(s => transport.api.content(body.thumbnail_url, s), CONFIG.requestTimeoutSeconds * 1000, signal);
      statistics.imageDownloads++;
      return image;
    }

    scheduleImagePump() {
      if (this.scheduled) return;
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        this.pumpImages();
      });
    }

    waitForMenuImage(file, signal, download, scope, kind = 'image', perform = download) {
      return new Promise((resolve, reject) => {
        const job = { file, signal, download, scope, kind, perform, resolve, reject, checking: false, settled: false };
        job.cancel = () => {
          if (job.settled) return;
          job.settled = true;
          this.pending.delete(job);
          signal?.removeEventListener('abort', job.cancel);
          reject(new DOMException('Reference preview unmounted', 'AbortError'));
        };
        if (signal?.aborted) return job.cancel();
        signal?.addEventListener('abort', job.cancel, { once: true });
        this.pending.add(job);
        this.scheduleImagePump();
      });
    }

    settleNativeImages(scope, file, response, error) {
      let releaseMetadata = false;
      for (const job of [...this.pending]) {
        if (job.scope !== scope || job.file !== file) continue;
        if (job.kind === 'metadata') {
          if (error || !response?.ok) releaseMetadata = true;
          continue;
        }
        this.finishNativeImage(job, response?.clone(), error);
      }
      if (releaseMetadata) releaseNativeImages(scope, file, { metadataOnly: true });
    }

    finishNativeImage(job, response, error) {
      if (job.settled) return;
      job.settled = true;
      this.pending.delete(job);
      job.signal?.removeEventListener('abort', job.cancel);
      if (error) job.reject(error);
      else job.resolve(response);
    }

    queueThumbnail(scope, file, download, { localOnly = false } = {}) {
      if (!cacheAllowed() || !download) return;
      const key = JSON.stringify([scope, file]);
      if (this.tasks.has(key)) return;
      this.failed.delete(key);
      const controller = new AbortController();
      const task = { controller, file, scope, download, started: false, localOnly };
      this.tasks.set(key, task);
      inventory.mark(file, 'pending');
      updateProgress();
      safely(this.downloads.run(async () => {
        if (controller.signal.aborted || activeScope !== scope) return;
        const cached = await cachedThumbnail(key);
        if (controller.signal.aborted || activeScope !== scope) return;
        if (cached) {
          statistics.thumbnailHits += 1;
          paintFile(file, cached);
          composerMentions.paintIcons();
          for (const job of this.pending) {
            if (job.scope === scope && job.file === file) job.cachedKey = key;
          }
          // Keep native full-size requests pending on a hit; a 48px response would
          // contaminate the application's original-image query cache.
        } else {
          if (storageWriteFailed) {
            const error = new Error('Cache storage unavailable');
            error.cacheStorageFailure = true; error.cachePaused = true;
            throw error;
          }
          task.started = true;
          const saved = await withRetries(controller.signal, async () => {
            const response = await boundedImage(signal => task.download(signal), CONFIG.requestTimeoutSeconds * 1000, controller.signal);
            if (controller.signal.aborted || activeScope !== scope) return false;
            if (!response.ok) {
              const error = new Error('Preview download failed');
              error.retryable = response.status >= 500;
              error.response = response;
              throw error;
            }
            if (!task.localOnly) this.settleNativeImages(scope, file, response);
            await saveThumbnail(scope, file, response, controller.signal);
            if (!thumbnailMemory.get(key)?.persisted) throw new Error('Preview could not be cached');
            return true;
          }, error => activeScope !== scope || error.cacheStorageFailure);
          if (!saved) return;
        }
        if (activeScope === scope) { this.completed.add(key); inventory.mark(file, 'ready'); }
      }, controller.signal, () => this.visibleFiles.has(file)).catch(error => {
        if (activeScope !== scope || controller.signal.aborted) return;
        this.failed.add(key);
        inventory.mark(file, 'failed');
        if (error.cacheStorageFailure) {
          this.storageFailed.add(key);
          // Only a pause caused solely by a lost connection is lifted automatically after reconnecting.
          if (!error.cachePaused) {
            storageWriteConnectionOnly = (!storageWriteFailed || storageWriteConnectionOnly) && Boolean(error.cacheConnectionFailure);
          }
          storageWriteFailed = true;
          // The network is fine: native requests still waiting for this file fetch it themselves.
          releaseNativeImages(scope, file);
        } else this.settleNativeImages(scope, file, error.response || null, error.response ? undefined : error);
      }).finally(() => {
        if (this.tasks.get(key) === task) this.tasks.delete(key);
        updateProgress();
      }));
    }

    resumeAfterReconnect() {
      if (!storageWriteFailed || !storageWriteConnectionOnly) return false;
      storageWriteFailed = false; storageWriteConnectionOnly = false;
      const scope = activeScope, keys = [...this.storageFailed];
      this.storageFailed.clear();
      for (const key of keys) {
        this.failed.delete(key);
        const [owner, file] = JSON.parse(key);
        const source = owner === scope ? referenceSources.get(file) : null;
        if (source) this.queueThumbnail(scope, file, signal => this.downloadReference(source.reference, source.transport, signal));
      }
      updateProgress();
      return true;
    }

    pumpImages() {
      this.visibleFiles = new Set();
      const visibleIds = new Set();
      for (const state of mountedMenus.values()) {
        if (!state.menu.isConnected) continue;
        for (const row of menuController.visibleRows(state)) {
          const ref = state.references.get(row);
          if (ref) visibleIds.add(ref.id);
          for (const pointer of [ref?.asset_pointer, ref?.thumbnail_asset_pointer]) {
            const file = fileKey(pointer);
            if (file) this.visibleFiles.add(file);
          }
        }
      }
      previewLoader.setVisible(visibleIds);
      for (const job of this.pending) {
        if (job.checking || job.settled) continue;
        if (job.signal?.aborted) { job.cancel(); continue; }
        job.checking = true;
        // Cache hits must not wait behind thousands of queued background downloads.
        const cached = thumbnailMemory.get(JSON.stringify([job.scope, job.file]));
        if (usableThumbnail(cached)) {
          job.cachedKey = cached.key;
          this.completed.add(cached.key);
          inventory.mark(job.file, 'ready');
          statistics.thumbnailHits += 1;
          thumbnailCache.touch(cached);
          paintFile(job.file, cached);
        } else {
          const source = job.download ? null : referenceSources.get(job.file);
          const download = job.download || (source && source.transport.scope === job.scope
            ? signal => this.downloadReference(source.reference, source.transport, signal)
            : null);
          if (download) this.queueThumbnail(job.scope, job.file, download);
        }
      }
      this.downloads.drain(); // Re-evaluate queued priorities after a scroll or search.
      updateProgress();
    }
  }

  // The only controller that invokes the application regeneration flow.
  class ChatGPTBridge {
    constructor() {
      this.selectedRequests = new Map();
      this.passThrough = new WeakSet();
      this.selection = null;
      this.bypassUntil = 0;
    }
    releaseNativeImages(scope, file, { metadataOnly = false } = {}) {
      const jobs = [...pendingRequests].filter(job => job.scope === scope && job.file === file);
      if (!jobs.length) return;
      const finishGroup = (group, selectedKey, executor) => {
        if (!group.length || this.selectedRequests.has(selectedKey)) return;
        const request = boundedImage(executor, CONFIG.selectedImageTimeoutSeconds * 1000);
        this.selectedRequests.set(selectedKey, request);
        safely(request.then(response => {
          for (const job of group) thumbnailLoader.finishNativeImage(job, response?.clone());
        }).catch(error => {
          for (const job of group) thumbnailLoader.finishNativeImage(job, null, error);
        }).finally(() => {
          if (this.selectedRequests.get(selectedKey) === request) this.selectedRequests.delete(selectedKey);
        }));
      };
      if (!metadataOnly) {
        const imageJobs = jobs.filter(job => job.kind !== 'metadata');
        finishGroup(imageJobs, JSON.stringify([scope, file]), imageJobs[0]?.download);
      }
      const metadataJobs = jobs.filter(job => job.kind === 'metadata');
      finishGroup(metadataJobs, JSON.stringify([scope, file, 'metadata']), metadataJobs[0]?.perform || metadataJobs[0]?.download);
    }

    pruneSelection() {
      if (this.selection && !this.selection.invoked && !this.selection.menu.isConnected) {
        const stale = this.selection;
        this.selection = null;
        stale.controller.abort();
      }
    }

    beforeReferenceSelection(event) {
      this.pruneSelection();
      if (event.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
      const row = event.target instanceof Element ? event.target.closest('[role="menuitem"]') : null;
      if (!row || row.getAttribute('aria-disabled') === 'true' || row.hasAttribute('disabled')) return;
      hoverPreview.close();
      if (!this.passThrough.has(row) && event.type !== 'pointerdown' && (event.type !== 'click' || event.button === undefined || event.button === 0)) {
        const state = [...mountedMenus.values()].find(state => state.menu.isConnected && state.menu.contains(row));
        if (state && this.selection) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        const bridge = state && activeScope && activeTransport?.scope === activeScope ? nativeSelection(row, activeAccount) : null;
        if (bridge && verifiedOwner([bridge.reference]) === scopeOwner(activeScope)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          safely(this.selectOneReference(state, row, bridge, activeTransport));
          return;
        }
      }
      for (const state of mountedMenus.values()) {
        const ref = state.references.get(row) || state.readOnlyRefs?.get(row) ||
          (state.menu.contains(row) ? menuController.rowReference(row, state) : null);
        if (!ref || !state.menu.isConnected) continue;
        // Run in capture phase, before React starts regeneration. New application
        // requests must never join the preview-only queue during this operation.
        this.bypassUntil = Date.now() + CONFIG.selectedImageTimeoutSeconds * 1000;
        for (const pointer of [ref.asset_pointer, ref.thumbnail_asset_pointer]) {
          const file = fileKey(pointer);
          if (!file) continue;
          if (activeScope) this.releaseNativeImages(activeScope, file);
          releaseReadOnlyPending(file);
        }
        break;
      }
    }

    continueCatalog(bridge, transport) {
      const run = async () => {
        if (activeScope !== transport.scope) return;
        const cached = await loadCatalog(transport.scope);
        if (cached) return;
        const session = startCatalogSession(transport);
        if (!session) return;
        const pages = await session.start();
        if (activeScope === transport.scope && !session.controller.signal.aborted && bridge.query.queryKey[2] === bridge.cacheKey &&
            bridge.query.state.fetchStatus !== 'fetching') bridge.scope.queryClient.setQueryData(bridge.query.queryKey, pages.flatMap(page => page.items));
      };
      const existing = backgroundCatalogs.get(transport.scope);
      const pending = !existing && bridge.query.state.fetchStatus === 'fetching' ? bridge.query.promise : null;
      if (pending?.then) safely(pending.catch(() => {}).then(run));
      else safely(run());
    }

    async selectOneReference(state, row, initial, transport) {
      const operation = { controller: new AbortController(), menu: state.menu, invoked: false };
      this.selection = operation;
      const href = location.href;
      let invoked = false;
      const verifying = localizedNotice('verify', 'verifyingReference', true);
      state.notice = verifying;
      state.menu.setAttribute('aria-busy', 'true');
      showStatus(state);
      const current = () => !operation.controller.signal.aborted && activeScope === transport.scope &&
        activeTransport?.scope === transport.scope && location.href === href && state.menu.isConnected && row.isConnected;
      try {
        statistics.singleReferenceChecks += 1;
        const response = await boundedImage(signal => transport.api.verify(initial.reference.id, signal),
          CONFIG.selectedImageTimeoutSeconds * 1000, operation.controller.signal);
        if (!current()) return;
        if (!response.ok) throw localizedUiError(response.status === 404 ? 'referenceNotFound' : 'verifyFailedRetry');
        const body = await response.json();
        if (!thumbnailMatchesReference(body.thumbnail_url, initial.reference)) {
          statistics.fastFallbacks += 1;
          state.notice = localizedNotice('refresh', 'waitingCatalog', true);
          this.passThrough.add(row);
          try { row.click(); } finally { this.passThrough.delete(row); }
          return;
        }
        const bridge = nativeSelection(row, activeAccount);
        if (!current() || !bridge || bridge.cacheKey !== initial.cacheKey || bridge.reference.id !== initial.reference.id ||
            bridge.reference.asset_pointer !== initial.reference.asset_pointer) return;
        // Preserve native account/route/source-image checks inside onRecreate.
        // setQueryData leaves an ongoing refresh running; never cancel it or mark
        // this placeholder snapshot as a freshly fetched complete catalog.
        bridge.scope.queryClient.setQueryData(bridge.query.queryKey, old => mergeReference(old, bridge.placeholder, bridge.reference), {
          updatedAt: bridge.query.state.dataUpdatedAt || 0,
        });
        this.bypassUntil = Date.now() + CONFIG.selectedImageTimeoutSeconds * 1000;
        for (const pointer of [bridge.reference.asset_pointer, bridge.reference.thumbnail_asset_pointer]) {
          const file = fileKey(pointer);
          if (file) this.releaseNativeImages(transport.scope, file);
        }
        this.continueCatalog(bridge, transport);
        state.notice = localizedNotice('send', 'sendingRegeneration', true);
        showStatus(state);
        invoked = true;
        operation.invoked = true;
        const sent = await bridge.onRecreate(bridge.reference);
        if (sent) {
          statistics.fastSelections += 1;
          state.notice = localizedNotice('check', 'regenerationSent');
          if (state.input?.dispatchEvent && typeof KeyboardEvent === 'function') {
            state.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
          }
        } else state.notice = localizedNotice('send', 'regenerationUnavailable', false, true);
      } catch (error) {
        if (current()) state.notice = localizedNotice(invoked ? 'send' : 'verify',
          invoked ? 'regenerationFailed' : error?.name === 'TimeoutError' ? 'verifyTimeout' :
            error?.uiMessageKey || 'verifyFailed', false, true);
      } finally {
        if (this.selection === operation) this.selection = null;
        if (state.notice === verifying) state.notice = null;
        state.menu.removeAttribute('aria-busy');
        showStatus(state);
      }
    }
  }

  class StoredPreviewOpener {
    constructor(misses = new RecentMisses()) {
      this.misses = misses;
      this.lookup = null;
    }
    cancel() { this.lookup = null; }
    matches(key, row) { return this.lookup?.key === key && this.lookup.row === row; }
    open({ key, row, state = null, cursor = null, closeBefore = null, canOpen, show }) {
      if (this.matches(key, row)) {
        if (cursor) this.lookup.cursor = cursor;
        return;
      }
      closeBefore?.();
      if (this.misses.has(key)) { this.lookup = null; return; }
      const lookup = { key, row, state, cursor };
      this.lookup = lookup;
      safely(storedPreviewUrl(key).then(url => {
        if (this.lookup !== lookup) return;
        this.lookup = null;
        if (!url) { this.misses.add(key); return; }
        if (!canOpen(lookup)) return;
        show(url, lookup);
      }));
    }
  }

  // DOM ownership, filtering, drawing and hover previews.
  class ReferenceMenuController {
    constructor(index) {
      this.mounted = new Map();
      this.rows = new MenuRows(index, row => this.rowLabels(row), row => rowFiberInfo(row).referenceId);
      this.previewPanel = null;
      this.previewNotice = null;
      this.previewMoveScheduled = false;
      this.observer = null;
      this.scheduled = false;
      this.progressTimer = null;
      this.readOnlyPreviewMisses = new RecentMisses();
      this.readOnlyOpener = new StoredPreviewOpener(this.readOnlyPreviewMisses);
      this.nativeSnapshots = new WeakMap();
    }
    get readOnlyHover() { return this.readOnlyOpener.lookup; }
    set readOnlyHover(value) { this.readOnlyOpener.lookup = value; }
    visible(row, menu) {
      if (!row.isConnected || row.hidden) return false;
      const a = row.getBoundingClientRect();
      const b = menu.getBoundingClientRect();
      return a.height > 0 && a.bottom > Math.max(0, b.top) && a.top < Math.min(innerHeight, b.bottom);
    }

    isActiveScope() {
      return Boolean(activeScope && activeTransport?.scope === activeScope);
    }

    readOnlySnapshot(state = null) {
      const account = requestContext?.account ?? null;
      if (readOnlyCatalog && readOnlyCatalog.identity === userId &&
          (!requestContext || readOnlyCatalog.account === account)) {
        return readOnlyCatalog;
      }
      const node = state?.menu?.querySelector?.('[role="menuitem"]') || state?.menu;
      const bridge = node ? nativeCatalog(node, account) : null;
      if (!bridge) return null;
      const items = Array.isArray(bridge.query.state.data) ? bridge.query.state.data :
        Array.isArray(bridge.query.options.placeholderData) ? bridge.query.options.placeholderData : null;
      if (!items) return null;
      // Rows, hover and the status line ask for this on every paint; rebuild only when the app's list or auth state changes.
      const authKey = JSON.stringify([userId, activeScope, Boolean(requestContext), account]);
      const cached = this.nativeSnapshots.get(items);
      if (cached && cached.length === items.length && cached.authKey === authKey) return cached.snapshot;
      const clean = items.map(cleanReference).filter(Boolean);
      const owner = verifiedOwner(clean);
      const snapshot = createCatalogSnapshot({
        scope: scopeForOwner(owner),
        account,
        record: { pages: [{ items: clean }] },
        items: clean,
      });
      this.nativeSnapshots.set(items, { length: items.length, authKey, snapshot });
      return snapshot;
    }

    readOnlyScopeFor(reference, state = null) {
      const owner = verifiedOwner([reference]) || referenceOwner(reference?.id);
      if (!owner) return null;
      const scoped = scopeForOwner(owner);
      if (scoped) return scoped;
      const snapshot = this.readOnlySnapshot(state);
      if (scopeOwner(snapshot?.scope) === owner) return snapshot.scope;
      const account = requestContext ? (requestContext.account || 'server-verified') : null;
      for (const [scope, record] of catalogs) {
        try {
          const [recordOwner, recordAccount] = JSON.parse(scope);
          if (recordOwner === owner && (!userId || record.identity === userId) &&
              (!account || recordAccount === account)) return scope;
        } catch {}
      }
      return null;
    }

    readOnlyAccountFor(scope, state = null) {
      if (requestContext) return requestContext.account ?? null;
      const snapshot = this.readOnlySnapshot(state);
      return snapshot?.scope === scope ? (snapshot.account ?? null) : null;
    }

    rowLabels(row) {
      // Resolve exact text nodes, avoiding avatar initials and edit labels.
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let text;
      const labels = [];
      while ((text = walker.nextNode())) {
        const label = text.nodeValue.trim();
        if (label) labels.push(label);
      }
      return labels;
    }

    rowReference(row, state = null) {
      const caching = this.isActiveScope();
      const id = rowFiberInfo(row).referenceId;
      if (caching) {
        if (id && referencesById.has(id)) return referencesById.get(id);
        for (const label of this.rowLabels(row)) {
          const refs = referencesByName.get(label);
          if (refs?.length === 1) return refs[0];
        }
      } else {
        const snapshot = this.readOnlySnapshot(state);
        if (id && snapshot?.byId.has(id)) return snapshot.byId.get(id);
        for (const label of this.rowLabels(row)) {
          const refs = snapshot?.byName.get(label);
          if (refs?.length === 1) return refs[0];
        }
      }
      return nativeSelection(row, caching ? activeAccount : (requestContext?.account ?? null))?.reference || null;
    }

    findRow(file) {
      for (const state of this.mounted.values()) {
        const row = [...(state.rowsByFile.get(file) || [])].find(row => row.isConnected);
        if (row && state.menu.isConnected && row.isConnected) return { row, state };
      }
      return null;
    }

    syncReadOnlyRows(state) {
      state.readOnlyRefs?.clear();
      state.readOnlyByFile?.clear();
      if (this.isActiveScope() || !state.rows) return;
      for (const row of state.rows) {
        const ref = this.rowReference(row, state);
        if (!ref) continue;
        state.readOnlyRefs?.set(row, ref);
        for (const pointer of [ref.asset_pointer, ref.thumbnail_asset_pointer]) {
          const file = fileKey(pointer);
          if (!file) continue;
          const bucket = state.readOnlyByFile?.get(file) || new Set();
          bucket.add(row);
          state.readOnlyByFile?.set(file, bucket);
        }
      }
    }

    findReadOnlyRow(file) {
      for (const state of this.mounted.values()) {
        if (!state.menu.isConnected) continue;
        const row = [...(state.readOnlyByFile?.get(file) || [])].find(r => r.isConnected);
        if (row) return { row, state, reference: state.readOnlyRefs?.get(row) || null };
      }
      return null;
    }

    visibleRows(state) {
      return this.rows.visible(state, innerHeight);
    }

    paint(row, record, { readOnly = false } = {}) {
      const slot = row.querySelector('[data-leading-icon-slot="menu"]');
      if (!slot) return;
      slot.dataset.refFastIcon = '';
      let image = slot.querySelector('[data-ref-fast-thumbnail]');
      if (!image) {
        image = document.createElement('img');
        image.dataset.refFastThumbnail = '';
        image.alt = '';
        image.width = 24;
        image.height = 24;
        image.className = 'ref-fast-thumbnail';
        slot.append(image);
      }
      image.onerror = () => {
        image.remove();
        delete slot.dataset.refFastIcon;
        if (readOnly) {
          try {
            const [, file] = JSON.parse(record.key);
            storedThumbnails.records.delete(record.key);
            storedThumbnails.knownKeys.delete(record.key);
            releaseReadOnlyPending(file);
          } catch {}
          return;
        }
        if (!this.isActiveScope()) return;
        const [owner, file] = JSON.parse(record.key);
        if (owner !== activeScope) return;
        thumbnailMemory.delete(record.key);
        thumbnailCompleted.delete(record.key);
        inventory.mark(file, 'pending');
        safely(storage.delete('thumbnails', record.key));
        for (const job of pendingRequests) {
          if (job.cachedKey === record.key) { job.checking = false; job.cachedKey = null; }
        }
        const source = referenceSources.get(file);
        if (source && source.transport.scope === activeScope) queueThumbnail(activeScope, file,
          signal => downloadReference(source.reference, source.transport, signal));
        scheduleImagePump();
      };
      if (image.src !== record.dataUrl) image.src = record.dataUrl;
    }

    paintFile(file, record) {
      for (const state of this.mounted.values()) {
        for (const row of state.rowsByFile.get(file) || []) if (this.visible(row, state.menu)) this.paint(row, record);
      }
    }

    updateProgress() {
      if (this.progressTimer) return;
      this.progressTimer = setTimeout(() => {
        this.progressTimer = null;
        for (const state of this.mounted.values()) this.showStatus(state);
      }, 100);
      this.progressTimer?.unref?.();
    }

    showStatus(state) {
      const locale = uiLocale();
      if (state.container) state.container.lang = locale;
      state.input?.setAttribute?.('aria-label', translateUi('searchLabel', {}, locale));
      if (state.input) state.input.title = translateUi('searchLabel', {}, locale);
      state.refresh?.setAttribute?.('aria-label', translateUi('refreshLabel', {}, locale));
      if (state.refresh) {
        const button = referenceRefreshState(backgroundCatalogs.get(activeScope),
          Boolean(cacheAllowed() && activeScope && activeTransport?.scope === activeScope), Boolean(nativeBridge.selection));
        state.refresh.disabled = button.disabled;
        state.refresh.title = button.title;
        state.refresh.setAttribute('aria-busy', String(button.busy));
      }
      if (state.notice) { renderUiStatus(state.status, state.notice); return; }
      if (!this.isActiveScope()) {
        const snapshot = this.readOnlySnapshot(state);
        const total = snapshot ? snapshot.byId.size : state.rows.length;
        const known = Boolean(snapshot) || state.rows.length > 0;
        const pages = snapshot?.record?.pages?.length || 0;
        const status = referenceStatus({
          readOnly: true,
          progress: { total: known ? total : null, discovered: total, ready: 0, failed: 0, pending: 0, complete: false },
          matched: state.matched, query: state.input?.value, pages,
          checkingCache: storage.checkingReads, storageError: storage.lastError,
        });
        renderUiStatus(state.status, status);
        return;
      }
      const progress = inventory.summary();
      const pages = collectedSessions.get(activeScope)?.pages.size || 0;
      const refresh = backgroundCatalogs.get(activeScope);
      const status = referenceStatus({ progress, matched: state.matched, query: state.input?.value, pages,
        refreshing: Boolean(refresh?.servingSnapshot && sessionRunning(refresh)),
        caching: thumbnailTasks.size > 0,
        checkingCache: storage.checkingReads,
        catalogError, storageError: storage.lastError, storageWriteFailed, previewProgress: previewLoader.inventory.summary(),
        previewCaching: previewLoader.tasks.size > 0, previewPaused: Boolean(previewLoader.paused) });
      renderUiStatus(state.status, status);
    }

    refreshList(state) {
      if (!cacheAllowed() || nativeBridge.selection || !activeScope || activeTransport?.scope !== activeScope) {
        this.showStatus(state);
        return null;
      }
      state.notice = null;
      const session = startCatalogSession(activeTransport, null, { preserveSnapshot: Boolean(catalogController.indexed), restart: true });
      safely(session.done);
      // Reflect the new session synchronously, before its first page or the 100ms progress timer.
      this.showStatus(state);
      return session;
    }

    findReferenceButton(target) {
      return referenceButton(target);
    }

    async loadHoverPreview(reference, signal, context) {
      // Reuse an already loaded native image, but never enlarge our cropped 48px cache.
      const native = context.nativeImage === false ? null : context.row.querySelector('img:not([data-ref-fast-thumbnail])');
      const source = native?.getAttribute('src');
      const local = native?.complete && native.naturalWidth > CONFIG.thumbnailSize && /^(blob:|data:image\/)/.test(source || '');
      const localResponse = local ? await boundedImage(s => originalFetch(source, { signal: s }),
        CONFIG.requestTimeoutSeconds * 1000, signal).catch(error => {
          if (signal?.aborted) throw error;
          return null;
        }) : null;
      const response = localResponse?.ok && /^image\//i.test(localResponse.headers.get('content-type') || '')
        ? localResponse
        : await downloadReference(reference, context.transport, signal);
      if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '')) throw new Error('Preview unavailable');
      return response.blob();
    }

    async resolveHoverPreview(key, reference, signal, context) {
      if (context.stored) return context.stored;
      const cached = await hoverPreview.cache.get(key, signal);
      if (cached) return cached;
      if (!cacheAllowed()) throw new DOMException('Reference caching stopped', 'AbortError');
      try {
        const record = await previewLoader.request(reference, context.transport, signal, async s => {
          const blob = await this.loadHoverPreview(reference, s, context);
          return new Response(blob, { headers: { 'Content-Type': blob.type } });
        });
        signal.throwIfAborted();
        return hoverPreview.cache.remember(record);
      } catch (error) {
        if (!error.cacheStorageFailure || signal.aborted) throw error;
        const blob = await this.loadHoverPreview(reference, signal, context);
        return hoverPreview.cache.put(key, blob, undefined, signal);
      }
    }

    showHoverPreview({ key, reference, context, status, url }) {
      if (!this.previewPanel) {
        const box = document.createElement('div');
        box.className = 'ref-fast-preview';
        box.dataset.refFastPreview = '';
        box.setAttribute('role', 'tooltip');
        const image = document.createElement('img');
        image.decoding = 'async';
        const caption = document.createElement('div');
        const message = document.createElement('div');
        message.setAttribute('role', 'status');
        box.append(image, caption, message);
        document.body.append(box);
        this.previewPanel = { box, image, caption, message };
      }
      const { box, image, caption, message } = this.previewPanel;
      image.onload = null;
      image.onerror = null;
      image.hidden = status !== 'ready';
      image.alt = reference.entity_name;
      caption.textContent = reference.entity_name;
      const notice = (icon, key, busy = false) => {
        this.previewNotice = localizedNotice(icon, key, busy);
        renderUiStatus(message, this.previewNotice);
      };
      const loading = () => notice('refresh', 'previewLoading', true);
      const failed = () => notice('error', 'previewFailed');
      if (status === 'error') failed(); else if (status !== 'ready') loading();
      message.hidden = status === 'ready';
      if (status === 'ready') {
        // Keep the loading notice until the browser has decoded the actual preview.
        loading();
        message.hidden = false;
        image.onload = () => {
          if (hoverPreview.target?.key !== key) return;
          message.hidden = true;
          this.positionHoverPreview(context);
        };
        image.onerror = () => {
          if (hoverPreview.target?.key !== key) return;
          hoverPreview.cache.delete(key);
          image.hidden = true;
          message.hidden = false;
          failed();
          this.positionHoverPreview(context);
        };
        image.src = url;
      } else image.removeAttribute('src');
      box.hidden = false;
      this.positionHoverPreview(context);
    }

    positionHoverPreview(context) {
      if (!this.previewPanel || this.previewPanel.box.hidden || !hoverPreview.current(context)) return;
      const { box, image } = this.previewPanel;
      if (!image.hidden && image.complete && image.naturalWidth && image.naturalHeight) {
        const size = previewImageSize(image.naturalWidth, image.naturalHeight, { width: innerWidth, height: innerHeight });
        image.style.width = `${size.width}px`;
        image.style.height = `${size.height}px`;
        box.style.width = `${Math.min(innerWidth - 16, Math.max(160, size.width + 22))}px`;
      } else box.style.width = `${Math.min(280, innerWidth - 16)}px`;
      const position = previewPosition(context.row.getBoundingClientRect(), context.container.getBoundingClientRect(),
        box.getBoundingClientRect(), { width: innerWidth, height: innerHeight }, context.cursor);
      box.style.left = `${position.left}px`;
      box.style.top = `${position.top}px`;
    }

    previewRow(state, target, cursor = null) {
      const row = target instanceof Element ? target.closest('[role="menuitem"]') : null;
      if (!row || !state.menu.contains(row) || !this.rows.isManaged(state, row)) {
        this.readOnlyHover = null; hoverPreview.close(); return;
      }
      const caching = this.isActiveScope();
      const reference = state.references.get(row) || state.readOnlyRefs?.get(row) || this.rowReference(row, state);
      if (!reference) { this.readOnlyHover = null; hoverPreview.close(); return; }
      if (caching) {
        this.readOnlyHover = null;
        if (verifiedOwner([reference]) !== scopeOwner(activeScope)) { hoverPreview.close(); return; }
        const key = previewKey(activeScope, reference);
        if (hoverPreview.target?.key === key && hoverPreview.target.context.row === row) {
          if (cursor) hoverPreview.target.context.cursor = cursor;
          return;
        }
        hoverPreview.open(key, reference, { row, state, container: state.menu, scope: activeScope, transport: activeTransport, cursor });
        return;
      }
      const scope = this.readOnlyScopeFor(reference, state);
      if (!scope || verifiedOwner([reference]) !== scopeOwner(scope)) {
        this.readOnlyHover = null; hoverPreview.close(); return;
      }
      const key = previewKey(scope, reference);
      const account = this.readOnlyAccountFor(scope, state);
      if (hoverPreview.target?.key === key && hoverPreview.target.context.row === row) {
        if (cursor) hoverPreview.target.context.cursor = cursor;
        return;
      }
      this.readOnlyOpener.open({
        key, row, state, cursor,
        closeBefore: () => hoverPreview.close(),
        canOpen: () => !this.isActiveScope() && row.isConnected && this.visible(row, state.menu),
        show: (url, lookup) => hoverPreview.open(key, reference, {
          row, state, container: state.menu, scope, account, identity: userId,
          stored: url, cursor: lookup.cursor,
        }),
      });
    }

    addSearch(menu) {
      const container = document.createElement('div');
      container.className = 'ref-fast-controls';
      container.dataset.refFastControls = '';
      const input = document.createElement('input');
      input.type = 'search';
      input.setAttribute('aria-label', translateUi('searchLabel'));
      input.title = translateUi('searchLabel');
      const search = document.createElement('label');
      search.className = 'ref-fast-search';
      search.append(uiIcon('search'), input);
      const status = document.createElement('small');
      status.setAttribute('role', 'status');
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.setAttribute('aria-label', translateUi('refreshLabel'));
      refresh.title = translateUi('refreshInBackground');
      refresh.append(uiIcon('refresh'));
      container.append(search, refresh, status);
      menu.prepend(container);
      const state = { menu, container, input, status, refresh };
      this.rows.init(state);
      this.mounted.set(menu, state);
      focusGate.prepare(menu);
      input.addEventListener('input', () => { if (!nativeBridge.selection) state.notice = null; this.filterRows(state); });
      input.addEventListener('keydown', event => {
        if (event.key !== 'Escape') event.stopPropagation();
      });
      container.addEventListener('pointermove', event => event.stopPropagation());
      refresh.addEventListener('click', () => this.refreshList(state));
      menu.addEventListener('pointerover', event => {
        if (event.pointerType !== 'touch') this.previewRow(state, event.target, { x: event.clientX, y: event.clientY });
      });
      menu.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        if (this.readOnlyHover?.state === state && this.readOnlyHover.row.contains(event.target)) {
          this.readOnlyHover.cursor = { x: event.clientX, y: event.clientY };
        }
        const context = hoverPreview.target?.context;
        if (context?.state !== state || !context.row.contains(event.target)) return;
        context.cursor = { x: event.clientX, y: event.clientY };
        if (this.previewMoveScheduled) return;
        this.previewMoveScheduled = true;
        requestAnimationFrame(() => {
          this.previewMoveScheduled = false;
          if (hoverPreview.target) this.positionHoverPreview(hoverPreview.target.context);
        });
      });
      const closePreview = () => { this.readOnlyHover = null; hoverPreview.close(); };
      menu.addEventListener('pointerout', event => {
        const row = hoverPreview.target?.context.row || this.readOnlyHover?.row;
        if (row && row.contains(event.target) && !row.contains(event.relatedTarget)) closePreview();
      });
      menu.addEventListener('focusin', event => this.previewRow(state, event.target));
      menu.addEventListener('focusout', event => {
        const row = hoverPreview.target?.context.row || this.readOnlyHover?.row;
        if (row && row.contains(event.target) && !row.contains(event.relatedTarget)) closePreview();
      });
      menu.addEventListener('keydown', event => { if (event.key === 'Escape') closePreview(); });
      menu.addEventListener('scroll', () => { closePreview(); this.scheduleMenuPaint(state); }, { passive: true, capture: true });
      return state;
    }

    filterRows(state) {
      this.rows.filter(state, state.input.value);
      if (hoverPreview.target && !hoverPreview.current(hoverPreview.target.context)) hoverPreview.close();
      this.showStatus(state);
      this.scheduleMenuPaint(state);
    }

    scheduleMenuPaint(state) {
      if (state.paintScheduled) return;
      state.paintScheduled = true;
      const render = () => {
        state.paintScheduled = false;
        if (!state.menu.isConnected) return;
        this.paintVisible(state); scheduleImagePump();
      };
      if (document.hidden) setTimeout(render, 0); else requestAnimationFrame(render);
    }

    paintVisible(state) {
      const caching = this.isActiveScope();
      for (const row of this.visibleRows(state)) {
        const ref = caching
          ? (state.references.get(row) || this.rowReference(row, state))
          : (state.readOnlyRefs?.get(row) || this.rowReference(row, state));
        if (!ref) continue;
        const file = referenceFile(ref);
        if (!file) continue;
        if (!caching) {
          const scope = this.readOnlyScopeFor(ref, state);
          if (!scope) continue;
          safely(storedThumbnails.indexScope(scope));
          const key = JSON.stringify([scope, file]);
          safely(storedThumbnails.load(key).then(record => {
            if (record && !this.isActiveScope() && row.isConnected) this.paint(row, record, { readOnly: true });
          }));
          continue;
        }
        state.references.set(row, ref);
        const scope = activeScope;
        for (const pointer of [ref.asset_pointer, ref.thumbnail_asset_pointer]) {
          const key = fileKey(pointer);
          if (key) {
            const bucket = state.rowsByFile.get(key) || new Set(); bucket.add(row); state.rowsByFile.set(key, bucket);
          }
        }
        if (verifiedOwner([ref]) === scopeOwner(scope)) {
          const transport = activeTransport;
          referenceSources.set(file, { reference: ref, transport });
          if (!thumbnailMemory.has(JSON.stringify([scope, file]))) queueThumbnail(scope, file,
            signal => downloadReference(ref, transport, signal));
        }
        safely(cachedThumbnail(JSON.stringify([scope, file])).then(record => {
          if (record && activeScope === scope && row.isConnected) this.paint(row, record);
          if (!record && activeScope === scope && row.isConnected) this.seedExistingThumbnail(row, ref);
        }));
      }
    }

    seedExistingThumbnail(row, ref) {
      if (!cacheAllowed()) return;
      if (!activeScope || !ref) return;
      const file = referenceFile(ref);
      if (!file) return;
      const key = JSON.stringify([activeScope, file]);
      if (thumbnailCompleted.has(key) || thumbnailMemory.has(key)) return;
      const image = row.querySelector('img:not([data-ref-fast-thumbnail])');
      const source = image?.getAttribute('src');
      if (image?.complete && image.naturalWidth && /^(blob:|data:)/.test(source || '')) {
        // Include offscreen images already in ChatGPT's memory cache as well.
        const localOnly = !(image.naturalWidth > CONFIG.thumbnailSize);
        const scope = activeScope;
        const local = async signal => {
          try {
            const response = await originalFetch(source, { signal });
            if (response.ok) return response;
          } catch (error) {
            if (signal?.aborted) throw error;
          }
          const entry = referenceSources.get(file);
          if (entry && entry.transport.scope === scope) {
            const currentTask = thumbnailTasks.get(key);
            if (currentTask) currentTask.localOnly = false;
            return downloadReference(entry.reference, entry.transport, signal);
          }
          throw new Error('Local thumbnail unavailable');
        };
        const task = thumbnailTasks.get(key);
        if (task && !task.started) {
          task.download = local;
          task.localOnly = localOnly;
        } else if (!task) queueThumbnail(activeScope, file, local, { localOnly });
      }
    }

    updateMenus() {
      syncChatRoute();
      this.scheduled = false;
      this.prepareReferenceButtons();
      if (hoverPreview.target && !hoverPreview.current(hoverPreview.target.context)) hoverPreview.close();
      composerMentions.sync();
      for (const [menu] of this.mounted) {
        if (!menu.isConnected) this.mounted.delete(menu);
      }
      if (lastButton && !lastButton.isConnected) lastButton = null;
      nativeBridge.pruneSelection();
      for (const menu of document.querySelectorAll('[role="menu"]')) {
        let state = this.mounted.get(menu);
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        const controlled = lastButton && lastButton.getAttribute('aria-controls') === menu.id;
        // Only rows rendered for a reference (React key AccountUserId_…~refimage_…) identify the menu;
        // an ancestor reference provider alone also covers unrelated menus in the same image block.
        const fiberMatched = !state && !controlled && items.some(row => Boolean(rowFiberInfo(row).referenceId));
        const nameMatched = !state && !controlled && !fiberMatched &&
          !items.some(row => Boolean(reactFiber(row))) && items.some(row => this.rowReference(row));
        if (!state && !controlled && !fiberMatched && !nameMatched) continue;
        if (!state) {
          state = this.addSearch(menu);
          // A menu matched only by row names may not be the reference menu, so it never starts caching.
          if (fiberMatched) catalogController.refreshOnOpen();
        }
        state.lastItemCount = items.length;
        const libraryItems = items.filter(isLibraryMenuItem);
        const synced = this.rows.sync(state, libraryItems);
        this.syncReadOnlyRows(state);
        if (synced) this.filterRows(state);
        else this.showStatus(state);
      }
      if (activeScope && catalogController.indexed && backgroundCatalogs.get(activeScope)?.servingSnapshot &&
          backgroundCatalogs.get(activeScope).complete) {
        catalogController.publish(catalogController.indexed, activeScope);
      }
      for (const job of [...pendingRequests]) {
        const selectedKey = job.kind === 'metadata'
          ? JSON.stringify([job.scope, job.file, 'metadata'])
          : JSON.stringify([job.scope, job.file]);
        // An unmounted preview must not leave a shared query pending forever,
        // including application requests which did not supply an AbortSignal.
        if (!this.findRow(job.file) && !selectedImageRequests.has(selectedKey)) job.cancel();
      }
      for (const job of [...readOnlyPending]) {
        if (!this.findReadOnlyRow(job.file)) job.cancel();
      }
      scheduleImagePump();
    }

    prepareReferenceButtons() {
      for (const button of document.querySelectorAll('button[aria-label]')) if (this.findReferenceButton(button)) clickGate.prepare(button);
    }

    schedule() {
      if (this.scheduled) return;
      this.scheduled = true;
      if (document.hidden) setTimeout(updateMenus, 0);
      else requestAnimationFrame(updateMenus);
    }

    mount() {
      const style = document.createElement('style');
      style.textContent = `
        .ref-fast-controls { position:sticky; top:0; z-index:5; padding:8px; display:grid;
          grid-template-columns:minmax(0,1fr) auto; gap:6px; background:var(--main-surface-primary,#fff); }
        .ref-fast-search { position:relative; min-width:0; display:flex; align-items:center; }
        .ref-fast-search > .ref-fast-symbol { position:absolute; inset-inline-start:10px; pointer-events:none; opacity:.7; }
        .ref-fast-controls input { box-sizing:border-box; width:100%; min-width:0; padding:8px 10px; padding-inline-start:34px;
          border:1px solid #8886; border-radius:8px; color:inherit; background:transparent; font:inherit; }
        .ref-fast-controls button { display:flex; align-items:center; justify-content:center;
          padding:8px; color:inherit; background:transparent; border:1px solid #8886; border-radius:8px; }
        .ref-fast-controls button:disabled { opacity:.6; cursor:wait; }
        .ref-fast-controls button[aria-busy="true"] .ref-fast-rotor { animation:ref-fast-spin 1s linear infinite; }
        @keyframes ref-fast-spin { to { transform:rotate(360deg); } }
        .ref-fast-controls small { grid-column:1/-1; opacity:.8; display:flex; align-items:center; flex-wrap:wrap; gap:6px 12px; }
        .ref-fast-metric { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; font-variant-numeric:tabular-nums; }
        .ref-fast-counts { display:inline-flex; gap:1px; --ref-fast-success:#146c43; --ref-fast-failure:#b42318; --ref-fast-total:#1d4ed8; }
        .ref-fast-count-success { color:var(--ref-fast-success); }
        .ref-fast-count-failure { color:var(--ref-fast-failure); }
        .ref-fast-count-total { color:var(--ref-fast-total); }
        .dark .ref-fast-counts, [data-theme="dark"] .ref-fast-counts { --ref-fast-success:#81c995; --ref-fast-failure:#f28b82; --ref-fast-total:#8ab4f8; }
        @media(forced-colors:active) { .ref-fast-counts span { color:CanvasText; } }
        .ref-fast-symbol { position:relative; display:inline-grid; place-items:center; width:${ICON_SIZE}px; height:${ICON_SIZE}px;
          flex-shrink:0; vertical-align:middle; direction:ltr; }
        .ref-fast-rotor { position:relative; display:grid; place-items:center; width:${ICON_SIZE}px; height:${ICON_SIZE}px;
          transform-origin:50% 50%; }
        .ref-fast-glyph { display:block; white-space:pre; text-align:left;
          font:${ICON_FONT}; line-height:${ICON_SIZE}px; }
        .ref-fast-glyph-badge { position:absolute; inset-inline-end:-3px; top:-4px; display:grid; place-items:center;
          min-width:10px; height:10px; border-radius:50%; background:var(--main-surface-primary,#fff);
          font:bold 10px/10px system-ui,sans-serif; }
        .ref-fast-working { animation:ref-fast-pulse 1.2s ease-in-out infinite; }
        @keyframes ref-fast-pulse { 50% { opacity:.25; } }
        @media(prefers-reduced-motion:reduce) {
          .ref-fast-working, .ref-fast-controls button[aria-busy="true"] .ref-fast-rotor { animation:none; }
        }
        .ref-fast-row { position:relative; content-visibility:auto; contain-intrinsic-size:auto 36px; }
        .ref-fast-row[hidden] { display:none !important; }
        [data-ref-fast-icon] { position:relative; }
        [data-ref-fast-icon] > :not([data-ref-fast-thumbnail]) { visibility:hidden; }
        .ref-fast-thumbnail { position:absolute; inset-inline-start:0; top:50%; transform:translateY(-50%);
          width:24px; height:24px; border-radius:50%; object-fit:cover; pointer-events:none;
          background:var(--main-surface-primary,#fff); z-index:1; }
        [data-ref-fast-mention-icon] { position:absolute; z-index:1; object-fit:cover; pointer-events:none; margin:0; padding:0; border:0; }
        .ref-fast-preview { position:fixed; z-index:2147483647; pointer-events:none; box-sizing:border-box;
          width:min(280px,calc(100vw - 16px)); max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); overflow:hidden;
          padding:10px; border:1px solid #8886; border-radius:12px; box-shadow:0 8px 32px #0004;
          background:var(--main-surface-primary,#fff); color:var(--text-primary,#111); font:13px/1.4 sans-serif; }
        .ref-fast-preview[hidden], .ref-fast-preview [hidden] { display:none !important; }
        .ref-fast-preview img { display:block; width:auto; height:auto; max-width:100%; margin-inline:auto; object-fit:contain; }
        .ref-fast-preview img + div { margin-top:6px; overflow-wrap:anywhere; display:-webkit-box;
          -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .ref-fast-preview [role="status"] { opacity:.75; margin-top:6px; }
      `;
      document.head.append(style);
      const alignRefreshGlyphs = () => {
        refreshGlyphOffsets.clear();
        for (const icon of document.querySelectorAll('.ref-fast-refresh')) centerRefreshGlyph(icon);
      };
      if (document.fonts) {
        void document.fonts.ready.then(alignRefreshGlyphs);
        document.fonts.addEventListener?.('loadingdone', alignRefreshGlyphs);
      }
      const updateLocale = () => {
        for (const state of this.mounted.values()) this.showStatus(state);
        if (this.previewNotice && this.previewPanel && !this.previewPanel.message.hidden) {
          renderUiStatus(this.previewPanel.message, this.previewNotice);
        }
      };
      this.localeObserver = new MutationObserver(updateLocale);
      this.localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
      window.addEventListener('languagechange', updateLocale);
      this.prepareReferenceButtons();
      this.observer = new MutationObserver(mutations => {
        // Thumbnail/progress mutations cannot change the set/order of menu rows.
        // Avoid rescanning thousands of rows for each completed image.
        let changed = false;
        for (const mutation of mutations) {
          const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
          if (target?.closest('[data-ref-fast-controls], [data-ref-fast-preview], [data-leading-icon-slot="menu"]')) continue;
          if (composerMentions.ignores(mutation, target)) continue;
          const row = target?.closest('[role="menuitem"]');
          if (row) for (const state of this.mounted.values()) if (state.menu.contains(row)) state.dirtyRows.add(row);
          changed = true;
        }
        if (changed) { this.prepareReferenceButtons(); this.schedule(); }
      });
      this.observer.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true,
        attributeFilter: ['aria-label', 'aria-expanded', 'aria-controls', 'data-state', 'aria-selected', 'aria-current'] });
      document.addEventListener('load', event => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement) || image.hasAttribute('data-ref-fast-thumbnail')) return;
        const row = image.closest('[role="menuitem"]');
        if (!row) return;
        for (const state of this.mounted.values()) {
          const ref = state.references.get(row);
          if (ref) this.seedExistingThumbnail(row, ref);
        }
      }, true);
      window.addEventListener('resize', () => { hoverPreview.close(); for (const state of this.mounted.values()) this.scheduleMenuPaint(state); });
      window.addEventListener('pagehide', () => { hoverPreview.close(); hoverPreview.cache.clear(); void accessWrites.flush(); });
      safely(pruneThumbnails());
      safely(hoverPreview.cache.prune());
      this.schedule();
    }
  }

  function scopeForOwner(owner) {
    if (!owner) return null;
    if (scopeOwner(activeScope) === owner) return activeScope;
    return requestContext ? scopeKey(owner, requestContext.account || 'server-verified') : null;
  }

  class StoredThumbnails {
    constructor(maxEntries = 600) {
      this.maxEntries = maxEntries;
      this.records = new Map();
      this.lookups = new Map();
      this.indexedScopes = new Map();
      this.knownKeys = new Set();
      this.misses = new RecentMisses();
    }
    peek(key) {
      const memory = thumbnailMemory.get(key);
      if (usableThumbnail(memory)) return memory;
      const known = this.records.get(key);
      if (usableThumbnail(known)) return known;
      if (known) this.records.delete(key);
      return null;
    }
    indexScope(scope) {
      if (!scope) return Promise.resolve(new Set());
      const existing = this.indexedScopes.get(scope);
      if (existing) return existing;
      const pending = storage.request('thumbnails', 'readonly', table => table.getAll()).then(records => {
        const keys = new Set();
        for (const record of records || []) {
          if (scopeOwner(record?.key) === scope && usableThumbnail(record)) {
            this.knownKeys.add(record.key);
            keys.add(record.key);
          }
        }
        return keys;
      }).catch(error => {
        if (this.indexedScopes.get(scope) === pending) this.indexedScopes.delete(scope);
        throw error;
      });
      this.indexedScopes.set(scope, pending);
      return pending;
    }
    async hasScopeKey(key) {
      if (this.peek(key) || this.knownKeys.has(key)) return true;
      if (this.misses.has(key)) return false;
      const scope = scopeOwner(key);
      if (!scope) return false;
      await this.indexScope(scope).catch(() => null);
      return this.knownKeys.has(key) || Boolean(this.peek(key));
    }
    load(key) {
      const cached = this.peek(key);
      if (cached) { this.knownKeys.add(key); return Promise.resolve(cached); }
      if (this.misses.has(key)) return Promise.resolve(null);
      const pending = this.lookups.get(key);
      if (pending) return pending;
      const lookup = storage.get('thumbnails', key).catch(() => null).then(record => {
        this.lookups.delete(key);
        if (record?.key !== key || !usableThumbnail(record)) { this.misses.add(key); return null; }
        this.knownKeys.add(key);
        this.records.set(key, record);
        while (this.records.size > this.maxEntries) this.records.delete(this.records.keys().next().value);
        return record;
      });
      this.lookups.set(key, lookup);
      return lookup;
    }
    deleteScope(scope) {
      this.indexedScopes.delete(scope);
      for (const key of this.records.keys()) {
        if (scopeOwner(key) === scope) this.records.delete(key);
      }
      for (const key of this.knownKeys) {
        if (scopeOwner(key) === scope) this.knownKeys.delete(key);
      }
    }
    clear() {
      this.records.clear();
      this.indexedScopes.clear();
      this.knownKeys.clear();
      this.misses.clear();
    }
  }

  // Composer @-mentions: large previews for the highlighted suggestion, caching started by opening the reference
  // suggestions, and stored-thumbnail covers for reference icons (suggestion rows and inserted mention pills).
  class ComposerMentions {
    constructor() {
      this.open = false;
      this.covers = new WeakMap();      // host element → { img, key }
      this.skipped = new WeakSet();     // hosts that are not references
      this.storedMisses = new RecentMisses();
      this.storedOpener = new StoredPreviewOpener(this.storedMisses);
    }
    get storedLookup() { return this.storedOpener.lookup; }
    set storedLookup(value) { this.storedOpener.lookup = value; }

    // The thumbnail/preview scope of a reference owner: the active scope when it belongs to that owner, otherwise
    // the scope this account would store it under.
    ownerScope(owner) {
      return scopeForOwner(owner);
    }

    // ChatGPT's 50-entry icon cache keeps swapping icons inside covered rows and pills; only a host's own
    // highlight attributes matter there.
    ignores(mutation, target) {
      if (mutation.type !== 'childList' && mutation.target === target) return false;
      const host = target?.closest(`[data-list-navigation-item], ${REFERENCE_PILL}`);
      const cover = host && this.covers.get(host);
      if (!cover?.img.isConnected) return false;
      if (!cover.shaped) this.shape(host, cover);
      return true;
    }

    // Copy the app image's shape. A cover made while the icon showed the fallback glyph of an evicted entry starts
    // round, like ChatGPT's reference icons, and takes the app image's exact shape once that image comes back.
    shape(host, cover) {
      const image = host.querySelector('img:not([data-ref-fast-mention-icon])');
      const radius = image ? getComputedStyle(image).borderRadius : '';
      cover.img.style.borderRadius = radius || '9999px';
      cover.shaped = Boolean(image);
    }

    // Follow the app's own highlight in the composer @-mention list; keyboard and mouse both move it.
    sync() {
      this.paintIcons();
      const found = highlightedMention(document);
      // Opening the @ suggestions' reference section counts as opening the reference menu: in a saved chat it
      // registers the chat and starts (or refreshes when due) its caching. The suggestion list itself is not changed.
      const open = Boolean(found) || document.querySelectorAll(MENTION_SECTION).length > 0;
      if (open && !this.open) catalogController.refreshOnOpen();
      this.open = open;
      const target = hoverPreview.target;
      if (!found) { this.storedLookup = null; if (target?.context.mention) hoverPreview.close(); return; }
      const id = mentionReferenceId(found.row);
      const managed = Boolean(activeScope && activeTransport?.scope === activeScope);
      const reference = managed && id ? referencesById.get(id) : null;
      if (!reference || verifiedOwner([reference]) !== scopeOwner(activeScope)) { this.previewStored(found, id); return; }
      this.storedLookup = null;
      const key = previewKey(activeScope, reference);
      if (target?.key === key && target.context.row === found.row) return;
      // A reference menu preview the pointer is on keeps priority over a stale composer highlight.
      if (target && !target.context.mention && hoverPreview.current(target.context)) return;
      hoverPreview.open(key, reference, { row: found.row, container: mentionContainer(found), scope: activeScope,
        transport: activeTransport, cursor: null, mention: true, nativeImage: false });
    }

    // Chats without an active reference cache (a new chat, for example) show only a large preview that is
    // already stored on disk for this account. No network request and no disk write is made here.
    previewStored(found, id) {
      const target = hoverPreview.target;
      const closeMention = () => { if (hoverPreview.target?.context.mention) hoverPreview.close(); };
      const owner = referenceOwner(id), pointers = owner ? mentionImagePointers(found.row) : null;
      if (!pointers || !userId || !requestContext) { this.storedLookup = null; closeMention(); return; }
      const account = requestContext.account ?? null;
      const scope = scopeKey(owner, account || 'server-verified');
      const reference = { id, entity_name: found.row.textContent.trim(), ...pointers };
      const key = previewKey(scope, reference);
      if (target?.key === key && target.context.row === found.row) return;
      if (target && !target.context.mention && hoverPreview.current(target.context)) return;
      this.storedOpener.open({
        key, row: found.row,
        closeBefore: closeMention,
        canOpen: () => found.row.isConnected && mentionHighlighted(found.row) && (requestContext?.account ?? null) === account,
        show: url => hoverPreview.open(key, reference, {
          row: found.row, container: mentionContainer(found), scope, account, stored: url,
          cursor: null, mention: true, nativeImage: false,
        }),
      });
    }

    // The reference id and image pointers of a suggestion row or an inserted mention pill.
    reference(host) {
      const pill = host.matches(REFERENCE_PILL) ? referencePill(host.getAttribute('data-prompt-link-href')) : null;
      const id = pill ? pill.id : mentionReferenceId(host);
      const owner = referenceOwner(id);
      const pointers = owner ? pill?.pointers || mentionImagePointers(host) : null;
      return pointers ? { id, owner, pointers } : null;
    }

    // ChatGPT keeps @-suggestion icons in a 50-entry cache. With more than 50 icon rows mounted, every new icon
    // evicts another and that row re-creates its own, forever, so icons flicker. Cover each reference icon with
    // this script's stored 48px thumbnail (memory or disk, read-only). The app's own icons stay underneath.
    paintIcons() {
      for (const host of document.querySelectorAll(`${MENTION_SECTIONS} [data-list-navigation-item], ${REFERENCE_PILL}`)) {
        if (this.skipped.has(host) || this.covers.get(host)?.img.isConnected) continue;
        const box = mentionIconBox(host);
        if (!box) continue; // An off-screen placeholder row has no icon yet.
        const reference = this.reference(host);
        const file = reference ? referenceFile(reference.pointers) : null;
        if (!file) {
          if (host.matches(REFERENCE_PILL) || !mentionReferenceId(host)) this.skipped.add(host);
          continue;
        }
        const scope = this.ownerScope(reference.owner);
        if (!scope) continue;
        const key = JSON.stringify([scope, file]);
        const url = this.thumbnail(key);
        if (url) this.cover(host, box, key, url);
      }
    }

    thumbnail(key) {
      const known = storedThumbnails.peek(key);
      if (known) return known.dataUrl;
      safely(storedThumbnails.load(key).then(record => { if (record) schedule(); }));
      return null;
    }

    cover(host, box, key, url) {
      const hostRect = host.getBoundingClientRect(), rect = box.getBoundingClientRect();
      if (!hostRect.width || !rect.width || !rect.height) return;
      const scaleX = box.offsetWidth > 0 ? rect.width / box.offsetWidth : (host.offsetWidth > 0 ? hostRect.width / host.offsetWidth : 1);
      const scaleY = box.offsetHeight > 0 ? rect.height / box.offsetHeight : (host.offsetHeight > 0 ? hostRect.height / host.offsetHeight : scaleX);
      const anchor = host.getClientRects?.()[0] || hostRect;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const img = document.createElement('img');
      img.dataset.refFastMentionIcon = '';
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.decoding = 'async';
      img.src = url;
      let left = (rect.left - anchor.left) / scaleX - (host.clientLeft || 0);
      let top = (rect.top - anchor.top) / scaleY - (host.clientTop || 0);
      Object.assign(img.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${rect.width / scaleX}px`,
        height: `${rect.height / scaleY}px`,
      });
      img.onerror = () => {
        img.remove();
        if (this.covers.get(host)?.img === img) this.covers.delete(host);
        storedThumbnails.records.delete(key);
        storedThumbnails.knownKeys.delete(key);
      };
      // Mark before inserting so the observer ignores this host's own icon churn and our insertion.
      const cover = { img, key, shaped: false };
      this.covers.set(host, cover);
      this.shape(host, cover);
      host.append(img);
      if (typeof host.getClientRects === 'function') {
        const placed = img.getBoundingClientRect();
        if (placed.width > 0 && Math.abs(placed.width - rect.width) <= 2 && Math.abs(placed.height - rect.height) <= 2) {
          const dx = rect.left - placed.left;
          const dy = rect.top - placed.top;
          if (Math.abs(dx) > 0.25 || Math.abs(dy) > 0.25) {
            left += dx / scaleX;
            top += dy / scaleY;
            img.style.left = `${left}px`;
            img.style.top = `${top}px`;
          }
        }
      }
      statistics.mentionIconOverlays += 1;
    }
  }

  function bindMethods(instance) {
    const proto = Object.getPrototypeOf(instance);
    const names = Object.getOwnPropertyNames(proto).filter(name =>
      name !== 'constructor' && typeof Object.getOwnPropertyDescriptor(proto, name)?.value === 'function'
    );
    return Object.fromEntries(names.map(name => [name, instance[name].bind(instance)]));
  }

  const storage = new Storage();
  const catalogController = new CatalogController();
  const thumbnailCache = new ThumbnailCache(storage);
  const thumbnailLoader = new ThumbnailLoader();
  const nativeBridge = new ChatGPTBridge();
  const storedThumbnails = new StoredThumbnails();
  const menuController = new ReferenceMenuController(catalogController.index);
  const composerMentions = new ComposerMentions();
  const {
    clearReferenceIndex, registerReferences, startCatalogSession, loadCatalog, invalidate
  } = bindMethods(catalogController);
  const {
    pruneThumbnails, cachedThumbnail, saveThumbnail
  } = bindMethods(thumbnailCache);
  const {
    downloadReference, scheduleImagePump, waitForMenuImage, queueThumbnail
  } = bindMethods(thumbnailLoader);
  const {
    releaseNativeImages, beforeReferenceSelection
  } = bindMethods(nativeBridge);
  const {
    visible, findRow, paint, paintFile, updateProgress, showStatus,
    findReferenceButton, loadHoverPreview, showHoverPreview,
    scheduleMenuPaint, updateMenus, schedule, mount
  } = bindMethods(menuController);
  const originalFetch = window.fetch.bind(window);
  const downloads = thumbnailLoader.downloads;
  const collectedSessions = catalogController.collectedSessions;
  const catalogs = catalogController.records;
  const referenceIndex = catalogController.index;
  const referencesByName = referenceIndex.byName;
  const referencesByFile = referenceIndex.byFile;
  const thumbnailMemory = thumbnailCache.memory;
  const inventory = new ThumbnailInventory();
  const referencesById = referenceIndex.byId;
  const referenceSources = thumbnailLoader.sources;
  const pendingRequests = thumbnailLoader.pending;
  const thumbnailTasks = thumbnailLoader.tasks;
  const thumbnailCompleted = thumbnailLoader.completed;
  const thumbnailFailed = thumbnailLoader.failed;
  const selectedImageRequests = nativeBridge.selectedRequests;
  const backgroundCatalogs = catalogController.sessions;
  const mountedMenus = menuController.mounted;
  const accessWrites = thumbnailCache.accessWrites;
  const statistics = { catalogHits: 0, storedCatalogServes: 0, mentionIconOverlays: 0, thumbnailHits: 0, imageDownloads: 0, cachedThumbnails: 0,
    fastSelections: 0, fastFallbacks: 0, singleReferenceChecks: 0 };
  let userId = null;
  let activeScope = null;
  let activeAccount = null;
  let verifiedAt = 0;
  let lastButton = null;
  let catalogBarrier = null;
  let pendingCatalogRoot = null;
  let activeTransport = null;
  let catalogEpoch = 0;
  let catalogError = false;
  let readOnlyCatalog = null;
  let storageWriteFailed = false;
  let storageWriteConnectionOnly = false;
  const readOnlyPending = new Set();
  function holdReadOnlyRequest(file, signal, perform) {
    return new Promise((resolve, reject) => {
      const job = { file, signal, settled: false, perform };
      job.cancel = () => {
        if (job.settled) return;
        job.settled = true;
        readOnlyPending.delete(job);
        signal?.removeEventListener('abort', job.cancel);
        reject(new DOMException('Reference preview unmounted', 'AbortError'));
      };
      job.release = () => {
        if (job.settled) return;
        job.settled = true;
        readOnlyPending.delete(job);
        signal?.removeEventListener('abort', job.cancel);
        Promise.resolve().then(perform).then(resolve, reject);
      };
      if (signal?.aborted) { job.cancel(); return; }
      signal?.addEventListener('abort', job.cancel, { once: true });
      readOnlyPending.add(job);
    });
  }
  function releaseReadOnlyPending(file) {
    for (const job of [...readOnlyPending]) {
      if (file === undefined || job.file === file) job.release();
    }
  }
  function cancelReadOnlyPending() {
    for (const job of [...readOnlyPending]) job.cancel();
  }
  const hoverPreview = new HoverPreview({
    cache: new PersistentPreviewCache(storage, { scope: () => activeScope }),
    load: loadHoverPreview, resolve: menuController.resolveHoverPreview.bind(menuController), show: showHoverPreview,
    hide: () => {
      if (menuController.previewPanel) {
        const { box, image } = menuController.previewPanel;
        box.hidden = true;
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
      }
    },
    current: context => (context.stored ? (requestContext ? (requestContext.account ?? null) === context.account :
      Boolean(userId && context.identity === userId)) :
      activeScope === context.scope && activeTransport?.scope === context.scope) &&
      context.container.isConnected && visible(context.row, context.container) && (!context.mention || mentionHighlighted(context.row)),
  });
  // Read-only lookup of a stored large preview; shown through the same bounded in-memory object URL cache.
  async function storedPreviewUrl(key) {
    const memory = hoverPreview.cache.memory;
    const cached = memory.get(key);
    if (cached) return cached;
    const record = await storage.get('previews', key).catch(() => null);
    if (record?.key !== key || !validPreview(record, hoverPreview.cache.disk)) return null;
    return memory.put(key, record.blob, record.savedAt);
  }
  const previewLoader = new PreviewLoader({ cache: hoverPreview.cache, queue: downloads,
    load: downloadReference, scope: () => activeScope, changed: updateProgress });

  let requestContext = null;
  let identitySequence = 0;
  // Credentials are applied in the order requests were sent, not the order responses arrive,
  // so a slow request carrying an older token cannot replace a newer one.
  let credentialRequests = 0, appliedCredentials = 0;
  const cacheSession = new ChatCacheSession({
    storage: {
      getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: key => window.localStorage.removeItem(key),
      keys: () => Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)),
    },
    start: async (context, signal) => {
      const response = await window.fetch(new URL(LIST_PATH, location.origin).href,
        { headers: new Headers(context.headers), credentials: 'include', signal });
      if (!response.ok) throw new Error('Reference cache startup failed');
    },
    cancel: () => {
      catalogEpoch++;
      for (const session of backgroundCatalogs.values()) session.controller.abort();
      setScope(null);
      thumbnailLoader.sharedImages.clear();
      updateProgress();
    },
    changed: updateProgress,
  });
  storage.onReconnect = () => {
    storedThumbnails.indexedScopes.clear();
    storedThumbnails.knownKeys.clear();
    thumbnailCache.reloadAfterReconnect();
    thumbnailLoader.resumeAfterReconnect();
    previewLoader.resumeAfterReconnect();
    updateProgress();
  };
  function cacheAllowed() {
    return cacheSession.running && cacheSession.chatId === chatIdFor(location.href);
  }
  function syncChatRoute() { cacheSession.route(location.href); }
  function syncTransportAuth(api, account) {
    if (requestContext && (requestContext.account ?? null) === (account ?? null)) {
      api?.setAuthorization?.(requestContext.headers.get('Authorization'));
    }
    return api;
  }
  function observeCredentials(headers, sequence) {
    if (!headers.has('Authorization') || sequence < appliedCredentials) return;
    appliedCredentials = sequence;
    const clean = cleanRequestHeaders(headers);
    const account = clean.get('ChatGPT-Account-ID');
    requestContext = { headers: clean, account };
    if (activeTransport && (activeAccount ?? null) === (account ?? null)) {
      activeTransport.api.setAuthorization?.(clean.get('Authorization'));
    }
    publishCredentials();
  }
  function publishCredentials() {
    if (!userId || !requestContext) return;
    cacheSession.credentials({
      ...requestContext,
      key: JSON.stringify([userId, requestContext.account]),
      authorization: requestContext.headers.get('Authorization'),
    });
  }

  function dropCatalogScope(scope, { local = false } = {}) {
    if (readOnlyCatalog?.scope === scope) readOnlyCatalog = null;
    if (scope === activeScope) verifiedAt = 0;
    storedThumbnails.deleteScope(scope);
    catalogs.delete(scope);
    collectedSessions.delete(scope);
    if (local) {
      if (scope === activeScope) {
        hoverPreview.close();
        hoverPreview.cache.clear();
        inventory.reset();
        catalogController.indexed = null;
        catalogError = false;
        storageWriteFailed = false;
        storageWriteConnectionOnly = false;
      }
      backgroundCatalogs.get(scope)?.controller.abort();
      backgroundCatalogs.delete(scope);
    }
  }

  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('reference-menu-fast-v1') : null;
  channel?.addEventListener('message', event => {
    if (event.data?.type === 'invalidate' && typeof event.data.scope === 'string') {
      dropCatalogScope(event.data.scope, { local: false });
    }
  });

  function safely(promise) {
    Promise.resolve(promise).catch(() => {});
  }


  function setScope(scope) {
    if (scope) readOnlyCatalog = null;
    if (activeScope !== scope) {
      hoverPreview.close();
      hoverPreview.cache.clear();
      previewLoader.reset();
      thumbnailLoader.sharedImages.clear();
      activeTransport = null;
      void accessWrites.flush();
      accessWrites.clear();
      inventory.reset();
      clearReferenceIndex();
      referenceSources.clear();
      catalogError = false;
      storageWriteFailed = false; storageWriteConnectionOnly = false;
      nativeBridge.selection?.controller.abort();
      for (const work of backgroundCatalogs.values()) work.controller.abort();
      backgroundCatalogs.clear();
      nativeBridge.bypassUntil = 0;
      verifiedAt = 0;
      for (const task of thumbnailTasks.values()) task.controller.abort();
      thumbnailTasks.clear();
      thumbnailCompleted.clear();
      thumbnailFailed.clear();
      thumbnailLoader.storageFailed.clear();
      for (const job of pendingRequests) job.cancel();
      cancelReadOnlyPending();
      for (const state of mountedMenus.values()) {
        for (const image of state.menu.querySelectorAll('[data-ref-fast-thumbnail]')) image.remove();
        for (const slot of state.menu.querySelectorAll('[data-ref-fast-icon]')) delete slot.dataset.refFastIcon;
      }
      activeScope = scope;
      catalogController.indexed = null;
      thumbnailCache.activate(scope);
    }
  }


  function jsonResponse(body) {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  }

  // Catalogs are keyed by the reference owner (AccountUserId_…), not by the /me user id, so a reference
  // mutation is matched to stored catalogs through the account and the verified identity.
  async function invalidateAccountCatalogs(account) {
    const scopes = new Set();
    if (activeScope && (account === null || activeAccount === account)) scopes.add(activeScope);
    const stored = account || 'server-verified';
    const records = [...catalogController.records.values(),
      ...(await storage.request('catalogs', 'readonly', table => table.getAll()).catch(() => []) || [])];
    for (const record of records) {
      try { if (userId && record.identity === userId && JSON.parse(record.key)[1] === stored) scopes.add(record.key); }
      catch { /* Ignore malformed records. */ }
    }
    for (const scope of scopes) await invalidate(scope);
  }

  // A completed collection can still serve pages; only a failed or cancelled one cannot.
  function servesPages(session) { return Boolean(session && !session.failed && !session.controller.signal.aborted); }

  function serveCatalog(record, signal) {
    signal?.throwIfAborted();
    statistics.catalogHits += record.pages.length;
    return jsonResponse(catalogBody(record));
  }

  function clearUserSession(credentialSequence, { clearIdentity = false } = {}) {
    appliedCredentials = Math.max(appliedCredentials, credentialSequence);
    if (clearIdentity) userId = null;
    else catalogEpoch += 1;
    readOnlyCatalog = null;
    pendingCatalogRoot = null;
    cancelReadOnlyPending();
    storedThumbnails.clear();
    if (!clearIdentity) setScope(null);
    cacheSession.credentials(null);
    requestContext = null;
  }

  function handleIdentity(request) {
    const sequence = ++identitySequence;
    return request.perform().then(response => {
      if (sequence !== identitySequence) return response;
      if (!response.ok) {
        if ([401,403].includes(response.status)) clearUserSession(request.credentialSequence, { clearIdentity: true });
        return response;
      }
      safely(response.clone().json().then(me => {
        if (sequence !== identitySequence) return;
        const next = me.id || me.user?.id || me.user_id;
        if (typeof next === 'string' && next !== userId) {
          const changedUser = userId !== null;
          userId = next;
          if (changedUser) clearUserSession(request.credentialSequence, { clearIdentity: false });
        }
        observeCredentials(request.headers, request.credentialSequence);
        publishCredentials();
      }));
      return response;
    });
  }

  // Reopen in a new tab: serve the disk catalog for this user/account before the server answers.
  async function serveStoredCatalog(request, account) {
    const epoch = catalogEpoch, identity = userId;
    const cached = await catalogController.cachedForAccount(account, identity);
    // A cache read must not switch back to an account superseded while it was pending.
    if (epoch !== catalogEpoch || identity !== userId) return request.perform();
    if (!cached) return null;
    // A click-triggered refresh may have finished while the cache read was pending.
    const snapshot = catalogController.records.get(cached.key) || cached;
    setScope(cached.key);
    activeAccount = account;
    activeTransport = {
      scope: cached.key,
      api: syncTransportAuth(referenceTransport(originalFetch, request.input, request.init, location.origin), account),
      identity,
    };
    if (catalogController.indexed !== snapshot) {
      catalogController.indexed = snapshot;
      registerReferences(cached.key, snapshot.pages.flatMap(page => page.items), true);
    }
    if (snapshot === cached) safely(catalogController.refreshIfDue(activeTransport)?.done);
    return serveCatalog(snapshot, request.signal);
  }

  // Verify the first page live, switch to its owner scope and hand the rest to the cache worker.
  async function bootstrapCatalog(request, account) {
    const { signal } = request;
    const epoch = ++catalogEpoch;
    if (activeScope && activeAccount !== account) setScope(null);
    let releaseCatalog;
    const barrier = new Promise(resolve => { releaseCatalog = resolve; });
    catalogBarrier = barrier;
    try {
      const api = syncTransportAuth(referenceTransport(originalFetch, request.input, request.init, location.origin), account);
      // This bootstrap belongs to the cache worker, not to the popup's signal.
      // Closing the popup must not cancel verification or the remaining pages.
      const firstResponse = await boundedImage(s => api.list(null, s), CONFIG.requestTimeoutSeconds * 1000, cacheSession.controller?.signal);
      if (epoch !== catalogEpoch) return firstResponse;
      const fail = () => { setScope(null); catalogError = true; updateProgress(); return firstResponse; };
      if (!firstResponse.ok) return fail();
      const firstBody = await firstResponse.clone().json();
      if (epoch !== catalogEpoch) return firstResponse;
      const owner = Array.isArray(firstBody.items) ? verifiedOwner(firstBody.items) : null;
      if (Array.isArray(firstBody.items) && firstBody.items.length && !owner) return fail();
      const currentScope = scopeKey(owner || userId, account || 'server-verified');
      if (!currentScope) return fail();
      setScope(currentScope);
      activeAccount = account;
      activeTransport = { scope: currentScope, api: syncTransportAuth(api, account), identity: userId, provisional: !owner };
      let cached = await loadCatalog(currentScope, false);
      if (cached && JSON.stringify(cached.pages[0]?.items) !== JSON.stringify((firstBody.items || []).map(cleanReference))) {
        await invalidate(currentScope);
        cached = null;
      }
      if (epoch !== catalogEpoch || activeTransport?.scope !== currentScope) return firstResponse;
      verifiedAt = Date.now();
      if (cached) {
        registerReferences(currentScope, cached.pages.flatMap(page => page.items), true);
        catalogController.indexed = cached;
        safely(catalogController.refreshIfDue(activeTransport, firstBody)?.done);
        return serveCatalog(cached, signal);
      }
      const worker = startCatalogSession(activeTransport, firstBody, { provisional: !owner });
      if (!worker) return firstResponse;
      return jsonResponse(await waitCatalogPage(worker, null, signal));
    } catch (error) {
      // Closing the menu cancels its waiter, not the independent catalog worker.
      if (signal?.aborted) throw error;
      if (epoch === catalogEpoch) { catalogError = true; updateProgress(); }
      // Internal cancellation, timeouts or an unexpected body must not fail the app's own request.
      return request.perform();
    } finally {
      if (catalogBarrier === barrier) catalogBarrier = null;
      releaseCatalog();
    }
  }

  function resolveCatalogRoot(work) {
    const pending = Promise.resolve().then(work);
    pendingCatalogRoot = pending;
    return pending.finally(() => {
      if (pendingCatalogRoot === pending) pendingCatalogRoot = null;
    });
  }

  // Outside a caching chat (a new chat, Spaces file views, …) the app still loads every reference page in sequence;
  // behind bulk image downloads those small requests can wait minutes and one failure fails the whole list. Answer
  // the first page from a fresh stored catalog of the same user/account instead. This is read-only: it does not
  // start caching, register the chat, refresh the catalog or write anything. Without such a catalog it passes through.
  async function serveCatalogReadOnly(request) {
    if (request.url.searchParams.get('cursor') !== null || !userId) return request.perform();
    const epoch = catalogEpoch, identity = userId;
    const account = request.headers.get('ChatGPT-Account-ID') ?? null;
    const record = await resolveCatalogRoot(() => catalogController.cachedForAccount(account, identity).catch(() => null));
    if (cacheAllowed()) return handleCatalogList(request);
    if (!record || epoch !== catalogEpoch || identity !== userId) return request.perform();
    request.signal?.throwIfAborted();
    const items = record.pages.flatMap(page => page.items);
    readOnlyCatalog = createCatalogSnapshot({ scope: record.key, account, identity, record, items });
    for (const state of mountedMenus.values()) {
      menuController.syncReadOnlyRows(state);
      showStatus(state);
      scheduleMenuPaint(state);
    }
    statistics.storedCatalogServes += 1;
    return jsonResponse(catalogBody(record));
  }

  async function handleCatalogList(request) {
    const { url, signal } = request;
    if (!cacheAllowed()) return serveCatalogReadOnly(request);
    signal?.throwIfAborted();
    const cursor = url.searchParams.get('cursor');
    const account = request.headers.get('ChatGPT-Account-ID');
    if (cursor === null) {
      const stored = await serveStoredCatalog(request, account);
      if (stored) return stored;
    }
    const recent = activeScope && activeAccount === account &&
      fresh({ savedAt: verifiedAt }, CONFIG.catalogVerificationMinutes * 60 * 1000);
    const session = recent && backgroundCatalogs.get(activeScope);
    if (cursor !== null) return servesPages(session) ? jsonResponse(await waitCatalogPage(session, cursor, signal)) : request.perform();
    if (recent) {
      const reuseScope = activeScope;
      const ready = await loadCatalog(reuseScope);
      if (ready && activeScope === reuseScope && activeAccount === account) return serveCatalog(ready, signal);
      if (servesPages(session)) return jsonResponse(await waitCatalogPage(session, null, signal));
    }
    return bootstrapCatalog(request, account);
  }

  function menusNeedSync(file) {
    if (mountedMenus.size === 0 && document.querySelector('[role="menu"]')) return true;
    for (const state of mountedMenus.values()) {
      if (!state.menu.isConnected) continue;
      if (state.lastItemCount !== undefined && state.menu.querySelectorAll('[role="menuitem"]').length !== state.lastItemCount) return true;
      if (file && !state.rowsByFile?.has?.(file) && !state.readOnlyByFile?.has?.(file) &&
          state.menu.querySelectorAll('[role="menuitem"]').length !== state.rows.length) return true;
    }
    return false;
  }

  // Image and download-metadata requests for rows in an open reference menu share the cache worker's download
  // or reuse already-stored thumbnails in read-only views.
  async function handleMenuImage(request, avatar = menuAvatarRequest(request.url, request.method)) {
    if (Date.now() < nativeBridge.bypassUntil || !avatar) return null;
    const { file, kind } = avatar;
    const referenceOpen = mountedMenus.size > 0 || lastButton?.getAttribute('aria-expanded') === 'true';
    if (!cacheAllowed()) {
      if (referenceOpen && pendingCatalogRoot) {
        let timer;
        await Promise.race([pendingCatalogRoot, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
        clearTimeout(timer);
      }
      if (menusNeedSync(file)) updateMenus();
      const hit = menuController.findReadOnlyRow(file);
      if (!hit) return null;
      const scope = hit.reference ? menuController.readOnlyScopeFor(hit.reference, hit.state) : null;
      if (!scope) return null;
      const key = JSON.stringify([scope, file]);
      if (!(await storedThumbnails.hasScopeKey(key))) return null;
      if (request.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      if (cacheAllowed() || Date.now() < nativeBridge.bypassUntil || !menuController.findReadOnlyRow(file)) return null;
      return holdReadOnlyRequest(file, request.signal, detachedDownload(originalFetch, request.input, request.init));
    }
    if (referenceOpen && catalogBarrier) {
      let timer;
      await Promise.race([catalogBarrier, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
      clearTimeout(timer);
    }
    if (menusNeedSync(file)) updateMenus();
    if (activeScope && findRow(file) && !storageWriteFailed) {
      const perform = detachedDownload(originalFetch, request.input, request.init);
      const source = kind === 'metadata' ? referenceSources.get(file) : null;
      const download = kind === 'metadata'
        ? (source && source.transport.scope === activeScope
          ? signal => downloadReference(source.reference, source.transport, signal)
          : null)
        : perform;
      return waitForMenuImage(file, request.signal, download, activeScope, kind, perform);
    }
    return null;
  }

  // Observe the app's own requests for chat deletion and reference mutations.
  async function observeResponse(request, response, deletedId) {
    const { url, method } = request;
    if (response.ok) cacheSession.deleted(await deletedId);
    if (method === 'GET' && [404,410].includes(response.status)) {
      const missing = conversationIdFromPath(url.pathname);
      if (missing === cacheSession.chatId) cacheSession.deleted(missing);
    }
    if (response.ok && method !== 'GET' && url.pathname.startsWith(LIST_PATH)) {
      safely(invalidateAccountCatalogs(request.headers.get('ChatGPT-Account-ID')));
    }
  }

  window.fetch = async function (input, init) {
    let url;
    try { url = new URL(input instanceof Request ? input.url : input, location.href); }
    catch { return originalFetch(input, init); }
    if (url.origin !== location.origin) return originalFetch(input, init);
    syncChatRoute();
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    const request = { input, init, url, method, headers, signal: init?.signal || (input instanceof Request ? input.signal : undefined),
      credentialSequence: ++credentialRequests, perform: () => originalFetch(input, init) };

    const deletedId = deletedChatId(url, method, input, init);

    if (method === 'GET' && url.pathname === '/backend-api/me') return handleIdentity(request);
    if (method === 'GET' && url.pathname === LIST_PATH) return handleCatalogList(request);
    const avatar = menuAvatarRequest(url, method);
    if (avatar) {
      const image = await handleMenuImage(request, avatar);
      if (image) return image;
    }
    const response = await request.perform();
    if (response.ok && method === 'GET' && url.pathname.startsWith('/backend-api/') && url.pathname !== LIST_PATH) {
      observeCredentials(headers, request.credentialSequence);
    }
    await observeResponse(request, response, deletedId);
    return response;
  };


  let routeTimer = null;
  function updateRouteTimer() {
    const active = cacheSession.pageActive && !document.hidden;
    if (active && routeTimer === null && window.setInterval) {
      routeTimer = window.setInterval(syncChatRoute, 1000);
      routeTimer?.unref?.();
    } else if (!active && routeTimer !== null) {
      window.clearInterval?.(routeTimer);
      routeTimer = null;
    }
  }
  for (const method of ['pushState', 'replaceState']) if (window.history?.[method]) {
    const original = window.history[method];
    window.history[method] = function (...args) { const result = original.apply(this, args); syncChatRoute(); return result; };
  }
  window.addEventListener?.('popstate', syncChatRoute);
  window.addEventListener?.('pageshow', () => { cacheSession.pageActive = true; syncChatRoute(); cacheSession.resume(); updateRouteTimer(); });
  window.addEventListener?.('pagehide', () => { cacheSession.pageActive = false; cacheSession.suspend(); updateRouteTimer(); });
  document.addEventListener?.('visibilitychange', () => { if (!document.hidden) syncChatRoute(); updateRouteTimer(); });
  window.addEventListener?.('storage', event => cacheSession.external(event.key));
  updateRouteTimer();
  syncChatRoute();

  const focusGate = new ReferenceFocusGate(() => mountedMenus.keys(), window);
  // Refresh only this menu's DOM-side blur callbacks before React captures the event, and on window blur release
  // only this menu's native window blur listener. Pointer-outside, Escape, trigger and selection handlers remain untouched.
  for (const type of ['blur', 'focusout']) window.addEventListener?.(type, event => focusGate.handle(event), true);
  const clickGate = new ReferenceClickGate(findReferenceButton);
  // Window capture precedes document/root listeners; document capture alone can run too late.
  for (const type of REFERENCE_HOVER_EVENTS) window.addEventListener?.(type, event => clickGate.handle(event), true);
  document.addEventListener('click', event => {
    const button = findReferenceButton(event.target);
    if (button) {
      lastButton = button;
      const controls = button.getAttribute('aria-controls');
      const opening = button.getAttribute('aria-expanded') !== 'true' && !(controls && document.getElementById(controls));
      if (opening) catalogController.refreshOnOpen();
    }
  }, true);
  document.addEventListener('pointerdown', beforeReferenceSelection, true);
  document.addEventListener('click', beforeReferenceSelection, true);
  document.addEventListener('keydown', beforeReferenceSelection, true);


  if (document.body && document.head) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });

  // Small diagnostics for local verification. Reference names, credentials and URLs are not exposed here.
  Object.defineProperty(window, '__referenceMenuFastStatus', {
    value: () => ({ ...statistics, version: '1.0.1', menuCount: mountedMenus.size, waitingImages: pendingRequests.size,
      windowBlurReleases: focusGate.windowBlurReleases, hoverPreviewOpen: Boolean(hoverPreview.target), hoverPreviewCached: hoverPreview.cache.entries.size,
      backgroundQueued: downloads.size, activeDownloads: downloads.active,
      activeBackgroundDownloads: downloads.activeBackground,
      thumbnailsReady: inventory.summary().ready, thumbnailsFailed: inventory.summary().failed,
      thumbnailProgress: inventory.summary(), catalogFetchFailed: catalogError, cacheStorageFailed: storageWriteFailed,
      cacheStorageError: storage.lastError,
      cacheStorageLastFailure: storage.lastFailure, cacheStorageReconnects: storage.reconnects,
      previewProgress: previewLoader.inventory.summary(), previewTasks: previewLoader.tasks.size, previewCachePaused: Boolean(previewLoader.paused),
      catalogItems: referencesById.size,
      collectedPages: collectedSessions.get(activeScope)?.pages.size || 0,
      fastSelectionPending: Boolean(nativeBridge.selection), backgroundCatalogRefreshes: [...backgroundCatalogs.values()].filter(sessionRunning).length,
      cacheChat: { available: Boolean(cacheSession.chatId), enabled: cacheSession.enabled, running: cacheSession.running, storageError: cacheSession.storageError },
      identityReady: Boolean(userId), scopeReady: Boolean(activeScope), config: { ...CONFIG } }),
  });
})();
