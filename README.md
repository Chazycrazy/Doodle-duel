# Doodle Duel — real-time two-player drawing and guessing

A private-room multiplayer browser game. Players alternate drawing and guessing over Socket.IO.

## Deploy to Render (free web service)

1. Upload **all files and the `public` folder** to the root of a new GitHub repository. The repository should show `package.json`, `server.js`, and a `public` folder containing `index.html`.
2. In [Render](https://dashboard.render.com), choose **New → Web Service** and connect that repository.
3. Choose **Node**, branch `main`, and leave **Root Directory** empty.
4. Set **Build Command** to `npm install` and **Start Command** to `npm start`.
5. Select **Free** compute if available (make sure the cost says $0/month), then deploy.
6. When the service is **Live**, open its `https://...onrender.com` URL. Create a private room and click **Copy invite link**. Send it to your friend, who enters their nickname and joins the room.

## Run locally

Install Node.js 18+, then from this folder:

```bash
npm install
npm start
```

Visit http://localhost:3000. For online play, deploy to a public Node.js host.

## Gameplay

- Exactly two players per room. Joining starts the game automatically.
- Six 60-second turns; each person draws three times.
- Drawer sees a secret word; guesser types guesses. Correct guess scores based on time remaining, and drawer earns 10 points.
- Click **Play rematch** after the game to reset scores.
- Rooms and scores live in server memory, so a restart loses them. Free hosts may sleep when idle; reconnect and create a new room if necessary.
- Keep to one server instance; this simple version doesn't share rooms across instances.

## File layout

```
package.json
server.js
public/
  index.html
```

Do not move `index.html` out of `public` without changing the server's static-file path.
