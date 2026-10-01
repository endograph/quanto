# quanto-datetime

Dates and times for [quanto](../quanto/README.md): `2026-10-02`, `Oct 2`, `03/04/2026`, `tomorrow 3pm`, `next fri` and `3:30 p.m.` parse into ISO 8601 strings.

```ts
import { date, dateTime, dateRange } from 'quanto-datetime';

date().parse('next fri', { now: '2026-09-30T14:02:11-04:00' });   // '2026-10-02'
dateTime().parse('tomorrow 3pm', { now: '2026-09-30T14:02:11-04:00' });
                                              // '2026-10-01T15:00:00-04:00'
dateRange(date()).parse('Oct 3-5', { now: '2026-09-30T14:02:11-04:00' });
```

- **Codecs**: `date()` (`YYYY-MM-DD`), `time()` (`HH:MM:SS`), `localDateTime()` and `dateTime()` (with the UTC offset it was entered in).
- **Common forms only.** The grammar and its deliberate omissions (month arithmetic, time zone names, …) are listed in the repository's `DESIGN.md`; anything else is a custom codec.
- **English month and weekday names are built in.** Other languages are opt-in data: `es`, `fr`, `de`, `it`, `pt` and `nl` from `quanto-datetime/names`, or your own `Names` object.

  ```ts
  import { de, fr } from 'quanto-datetime/names';

  date({ names: [de, fr] }).parse('2. Oktober 2026');   // '2026-10-02'
  date({ names: [de] }).format('2026-10-02', { locale: 'de-DE' });   // '2 Okt 2026'
  ```
- **`dateRange`** works with all four codecs: `Oct 3-5`, `Dec 30 - Jan 2`, `9-5pm`, `Oct 3 10pm-1am`.
- **`intlDate`, `intlTime`, `intlDateTime`**: opt-in, display-only `Intl` formatters.

`quanto` is a peer dependency. In a browser, omit `ctx.now`; on a server parsing for a user, pass their `now`.
