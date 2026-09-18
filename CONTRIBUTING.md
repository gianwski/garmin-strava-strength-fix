# Contributing

Thanks for helping improve Strength Workout Fixer!

## Ways to help

- **Report a bug**: open an issue with the "Bug report" template.
- **Exercise not recognised**: open an issue with the "Exercise name problem" template.
- **Code or text changes**: open a pull request (see below).

## Never share personal workout files

Do **not** attach your .zip, .fit or .csv files to issues or pull requests: they contain
personal data (times, heart rate, weights). Describe the problem instead, or share a
screenshot with personal data hidden.

## Run the site locally

The site is plain HTML and JavaScript, no build step. From the repository folder run:

```
python -m http.server 8000
```

then open http://localhost:8000 in your browser.

## Pull requests

1. Fork the repository and create a branch for your change.
2. Keep the change small and focused on one thing.
3. Test it with a real Garmin strength workout: load the file, download the corrected
   file and check it opens on Strava.
4. Open a pull request and fill in the template.

Rules for code changes:

- **Files must never leave the user's device.** No uploads, analytics, trackers or
  new external requests. Pull requests that add them will not be accepted.
- Do not add files from the Garmin FIT SDK to the repository (licence restrictions):
  the exercise list is loaded at run time from Garmin's official package.
- Only the `set` messages of the FIT file may be changed; everything else must stay byte-identical.

By contributing you agree that your contribution is licensed under the MIT License of this project.
