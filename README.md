# Strength Workout Fixer from Garmin to Strava

Fix the strength training exercises your Garmin watch got wrong, and see the right workout on Strava.

**Open the app: https://gianwski.github.io/garmin-strava-strength-fix/**

Garmin watches often misidentify strength exercises (a chest press becomes a sit-up,
a lat pulldown a pull-up…). You can fix them in Garmin Connect, but those fixes never
reach Strava even if the automatic sync is on. Also, if you correct the exercise in Garmin the `.fit` file you can upload on Strava does not contain the corrected exercise names.

This web app fixes the `.fit` file with the correct workout name:

1. This is optional, but **very recommended**: fix the exercises name in the Garmin app (or in the [browser](https://connect.garmin.com/modern/activities) if you prefer).

2. In [Garmin Connect webpage](https://connect.garmin.com/modern/activities), open the activity, tap on gear icon and then tap on "Export File" (a `.zip` file should be downloaded). Then, if you have done step 1, tap on "Exports Splits on CSV" (a `.csv` file should be downloaded).
  
<img src="./images/gif1.gif" width="600">
     
2. Open the app, load the `.zip` (and the `.csv` if you already have corrected the exercise in the app or the browser) and edit the exercises name in the web app if you have not already corrected.

<img src="./images/gif2.gif" width="600">


3. **Download** the corrected file.
4. **Delete the original activity on Strava**, then upload the new file at
   [strava.com/upload](https://www.strava.com/upload/select).

Strava then shows the correct exercises, sets, reps and weights.
Heart rate, calories and times stay exactly as recorded by your watch.

Everything runs in your browser: your files are never sent anywhere.
Works on phone and computer, no install, no Strava subscription needed.

## Disclaimer

Use at your own risk. The software is provided "as is", without warranty of any kind.

Independent open-source project, not affiliated with Garmin or Strava.

Privacy: no cookies, no tracking, no data collection. Files are processed only in your browser.

## License

MIT, see [LICENSE](LICENSE). This applies to the code in this repository only.
