# Devvit Svelte Example

This is a simple example of a Devvit app using Svelte.

## Running the app

1. Run `npm run dev` to start the development server.
2. Run `npm run build` to build the app.
3. Run `npm run deploy` to deploy the app.
4. Run `npm run launch` to launch the app.
5. Run `npm run check` to check the app.

## Configure devvit.json

- **name**: the app's username shown in Devvit. e.g "delete23423"
- **label**: text shown in the subreddit menu
- **description**: short helper text under the label
- **subreddit**: subreddit to test against (e.g., "cat543")

```json
{
  "name": "your-app-username",
  "menu": {
    "items": [
      {
        "label": "Create Post",
        "description": "Start a new post"
      }
    ]
  },
  "dev": {
    "subreddit": "cat543"
  }
}
```
