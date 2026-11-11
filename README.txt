DAILY DEVOTIONAL SITE

Files
  index.html, site.js   public page (Today and Archive tabs)
  admin.html, admin.js  your upload page (password protected)
  style.css             colors and design for both pages
  netlify/functions     the code that saves and serves posts and audio
  storage/              where every upload is stored (see storage/README.txt)

SET UP (once)
  1. Put the whole folder on Netlify. Drag it onto https://app.netlify.com/drop
     (if Netlify complains about the functions, use "Deploy with Git" or the Netlify CLI: netlify deploy --prod)
  2. In Netlify: Site configuration > Environment variables > add
        ADMIN_PASSWORD = (choose a password)
     Then deploy again (Deploys > Trigger deploy) so it takes effect.
  3. Open  https://YOUR-SITE.netlify.app/admin.html  and sign in with that password.

DAILY USE
  Upload or schedule a post. It is saved to "storage" instantly and shows on the site by itself.
  You do NOT need to re-upload the folder to Netlify any more.

NOTES
  - Live Server / local preview can't save (no storage there). Use the Netlify site, or run "netlify dev".
  - Visitors never receive posts that are scheduled for the future.
