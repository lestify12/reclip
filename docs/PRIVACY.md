# Reclip privacy policy

*Last updated: November 27, 2026*

Reclip is a desktop app that runs entirely on your own computer. It has no Reclip server and no Reclip account, and the people who make Reclip never receive your data.

## What stays on your computer

- The videos you import, their transcripts, the clips Reclip makes and your project files.
- Your settings and API keys, saved in the `.env` file in the Reclip folder.
- The sign-in tokens for YouTube and TikTok that you connect, saved in Reclip's local `.cache` folder.

## What is sent to other services, and only when you use them

- **YouTube (Google):** the clips you choose to upload, with their titles, descriptions, tags and thumbnails. With Auto-pilot or channel lessons turned on, Reclip also reads public video information and your uploads' view counts through the YouTube Data API.
- **TikTok:** the clips you choose to send, which go to your own TikTok inbox as drafts. Reclip reads only your basic profile (display name and account ID) to show which account is connected. It does not read your videos, followers, messages or any other TikTok data.
- **Twitch:** public information about streams, videos and clips on your Auto-pilot watchlist.
- **AI providers you add a key for** (for example Gemini, Groq, Claude, OpenAI or Ollama): clip transcript text, to write titles and descriptions or to help pick moments.

Each of these services handles that data under its own privacy policy.

## Removing your data

Disconnect YouTube or TikTok in Reclip's **Automation** page to delete their sign-in tokens; you can also revoke access in your Google or TikTok account settings. Deleting a project in Reclip deletes its files. Deleting the Reclip folder removes everything Reclip stored.

## Contact

Questions about this policy: open an issue at <https://github.com/lestify12/reclip/issues>.
