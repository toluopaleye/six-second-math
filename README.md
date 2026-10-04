# Six Second Math

Mental math practice for trading and quant interviews: +, −, ×, ÷, decimals and fractions against a
per-question target that steps down from 10 seconds to 6. Miss one, run over, or tap "Show me how" and you
get the method for doing it in your head, then a similar question a few later. Sign in with Google or email
and your progress follows you to any device.

Everything here is free: Firebase's Spark plan (no card) for sign-in and saving, and GitHub Pages for hosting.

## One-time setup

### 1. Firebase: sign-in and saving progress (about 6 minutes)
1. Go to https://console.firebase.google.com and sign in with your Google account.
2. **Create a project.** Name it `six-second-math`. Google Analytics can be off.
3. **Build › Authentication › Get started.** On the **Sign-in method** tab, turn on **Google**
   (choose your support email, then Save) and **Email/Password** (Enable, then Save).
4. **Build › Firestore Database › Create database.** Pick a location near you, choose
   **production mode**, then Create. Open the **Rules** tab, replace everything with the contents of
   `firestore.rules` from this folder, and click **Publish**.
5. **Project settings** (gear icon) › **General** › **Your apps** › the web icon `</>`. Give it any
   nickname and click **Register app** (you don't need Firebase Hosting). Copy the `firebaseConfig`
   values into `config.js` here, like this:

   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "…",
     authDomain: "six-second-math.firebaseapp.com",
     projectId: "six-second-math",
     appId: "…"
   };
   ```

   These values identify your project; they are not passwords. `firestore.rules` is what keeps each
   person's progress private to them.

### 2. Put the site online (GitHub Pages, about 4 minutes)
1. Create a **public** repository on GitHub (for example `six-second-math`) and upload every file in
   this folder to it, including the hidden `.nojekyll` file.
2. In the repository: **Settings › Pages › Build and deployment** › Source: **Deploy from a branch**,
   Branch: **main**, folder **/ (root)**, then Save. After a minute the site is at
   `https://YOUR-USERNAME.github.io/six-second-math/`.
3. Back in Firebase: **Authentication › Settings › Authorized domains › Add domain**, and add
   `YOUR-USERNAME.github.io`. Without this, Google sign-in is refused on your site.

Optional: a custom address such as `sixsecondmath.com` costs about $10 a year from a registrar. Add it under
Settings › Pages › Custom domain, then add that domain to Firebase's authorized domains too.

## Files
- `index.html`, `app.js`, `engine.js`: the app. `engine.js` makes the questions and their step-by-step methods.
- `cloud.js`: sign-in and saving (Firebase), bundled.
- `config.js`: your Firebase project settings.
- `firestore.rules`: who can read and write saved progress (each person, only their own).
- `firebase.json`: lets you host on Firebase Hosting instead (`firebase deploy` from this folder).

## How saving works
Progress is always kept in your browser. After you sign in it is also saved to your account
(`users/{your id}` in Firestore, about 10 seconds after you stop answering, and when you leave the page),
so it shows up wherever you sign in. If your account already has progress, signing in on a new device loads it.
