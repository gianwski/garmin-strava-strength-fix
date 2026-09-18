# Strength Workout Fixer

Fix the strength training exercises your Garmin watch got wrong, and see the right workout on Strava.

**Open the app: https://gianwski.github.io/garmin-strava-strength-fix/**

Garmin watches often misidentify strength exercises (a chest press becomes a sit-up,
a lat pulldown a pull-up…). You can fix them in Garmin Connect, but those fixes never
reach Strava, because Strava keeps the original file sent by the watch.

This web app fixes the workout file itself:

1. In [Garmin Connect](https://connect.garmin.com/modern/activities), open the activity → gear icon → **Export Original** (.zip).
   Optional: fix the exercises there first (app or browser) and also **Export to CSV**.
2. Open the app, load the .zip (and the .csv), check the exercises.
3. **Download** the corrected file.
4. **Delete the original activity on Strava**, then upload the new file at
   [strava.com/upload](https://www.strava.com/upload/select).

Strava then shows the correct exercises, sets, reps and weights.
Heart rate, calories and times stay exactly as recorded by your watch.

Everything runs in your browser: your files are never sent anywhere.
Works on phone and computer, no install, no Strava subscription needed.

## Disclaimer

Use at your own risk. Keep the original .zip from Garmin Connect until you have checked the new
workout on Strava. The software is provided "as is", without warranty of any kind.

Independent open-source project, not affiliated with, endorsed by or sponsored by Garmin or Strava.
Garmin and Strava are trademarks of their respective owners and are used only to describe compatibility.

The exercise list is not stored in this repository: the page loads it at run time from Garmin's
official FIT SDK package ([@garmin/fitsdk](https://www.npmjs.com/package/@garmin/fitsdk)), which is
covered by Garmin's FIT Protocol License.

Privacy: no cookies, no tracking, no data collection. Files are processed only in your browser.
The exercise list is downloaded from the jsDelivr CDN; the site is hosted on GitHub Pages.

## License

MIT, see [LICENSE](LICENSE). This applies to the code in this repository only.
