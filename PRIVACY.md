# Privacy

GPS Kids Speak is free public-speaking practice for children ages 5 to 17. This note is for parents and for anyone who runs their own copy.

## What a child is asked for

Nothing that identifies them.

- No child name
- No child email
- No child photo
- No child phone number
- No school name

Practice, scores, and recordings stay on the device. A "take me home" link can move scores to another phone. That link does not carry a name. The app does not upload a recording to keep it.

Speech may be turned into words for a single tip. Those words are not stored.

## Grown-ups

A parent can leave:

- their first name
- their email
- a child's age band (for example 8 to 10)

That form sits behind a grown-up check: a short math question, not a countdown and not a published PIN.

A trial-class form, if the person running the site turns it on, asks for the parent's name and phone and the child's age. It refuses a child's name.

## What is not collected

- No public leaderboard of children
- No pitch recording archive
- No analytics vendor and no tracking pixel in this repository
- No shared coach PIN

Anonymous counts (such as "a talk started") can be stored with a random number so a school can see that the app is used. Those rows are not a name, a voice, or the words a child said.

## The timer

Kids do not see a countdown clock. A ring fills while they talk. The practice stops on its own when the ring is full. There is no on-screen "0:00".

## Your own copy

If you deploy this app, you are the operator of that copy. Parent emails you collect live in your Cloudflare database. Do not add a field for a child's name, email, or photo. Do not commit secrets. Set a contact address in `public/brand.js` if families should be able to reach you.
