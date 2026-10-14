# SiteMinder SiteConnect onboarding

iRatePilot's SiteConnect inventory endpoint is:

`https://www.iratepilot.com/api/integrations/siteminder/siteconnect`

The endpoint accepts SOAP 1.1 over HTTPS with `text/xml; charset=utf-8` and validates the WS-Security `UsernameToken` on every request. Channel usernames and passwords are stored only in the encrypted PMS credential vault.

For SiteMinder's initial Rooms and Rates call, configure the hotel connection with:

- the iRatePilot external property code used as SiteMinder `HotelCode`;
- at least two room mapping lines using the exact active iRatePilot room name: `Room name = ROOM_CODE`;
- at least two explicit rate mappings for every room: `ROOM_CODE: Rate name = RATE_CODE`;
- the certified pricing model, `PDP` or `OBP`.

The endpoint currently implements the certification-first Rooms and Rates operation. Availability, restriction, rate update, and reservation operations must remain disabled until SiteMinder issues the test environment, confirms the RequestorID and reservation endpoint, and the integration passes certification.
