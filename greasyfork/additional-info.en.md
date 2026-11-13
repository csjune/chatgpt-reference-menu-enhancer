Makes the reference-image menu on ChatGPT images faster to use: name search, saved thumbnails and large previews.

## Features

- **Search** reference names: every word you type must match, with no result limit.
- **Large previews** when you hover over or focus a reference, both in the reference menu and in the message box's @ mention suggestions.
- **Saves** the reference list and images in your browser, so the menu opens quickly next time.
- **No flickering icons** in @ mention suggestions or in references mentioned in a message.
- **Stays open** when you move the keyboard focus away or switch to another window.
- **Faster selection**: pick a reference without waiting for the whole list to load.

## How to use

1. In a saved chat, click a generated image's reference icon, or type @ in the message box. Either one starts saving references for that chat.
2. Type part of a name or code in the search field. Hover over or focus an item to see its preview.
3. As usual, select a reference under **Recreate with**.
4. Click ↻ to get the latest list. Clicking it again while it is updating starts over.

The menu still closes when you click outside it, press Escape, click the reference icon again or finish a selection. Saving keeps going after the menu closes. It pauses when you leave the chat and picks up again in the last **five chats** where you opened the menu or the @ mention suggestions.

## Good to know

- The list updates by itself when you open the menu, at most every **30 minutes**. Use ↻ to see changes right away.
- Lists are kept for 24 hours and images for 30 days. Thumbnails are 48×48 px; previews fit within 480×340 px.
- In Space or a new chat, the saved list and previews show up right away, without downloading them again.
- Everything is saved only in your browser, separately for each account. Login details are never saved, and nothing is sent to analytics services.
- Messages are available in English, Korean, Japanese, Simplified and Traditional Chinese, Spanish, French, German, Brazilian Portuguese and Russian. The reference button has been tested only with ChatGPT in Korean and English.
- This is an unofficial script and may stop working when ChatGPT changes.

## Troubleshooting

- Reload ChatGPT after installing or updating the script.
- The numbers in the menu show how many items are saved: `120` when all of them are saved, and `118/2/120` (saved/failed/total) otherwise. `?` means the total is not known yet.
- If something goes wrong, please report your browser, userscript manager, script version and what you did. Remove account details and chat content from any screenshots.

## License

MIT
