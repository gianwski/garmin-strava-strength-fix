# Garmin → Strava Strength Fix

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

MIT License · Not affiliated with Garmin or Strava.
