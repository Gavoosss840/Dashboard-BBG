import datetime as dt

# "Today" for this mock terminal - all seeded data and P&L calculations are anchored to this date.
AS_OF = dt.date(2026, 7, 15)


def business_days_between(start: dt.date, end: dt.date) -> list[dt.date]:
    days = []
    current = start
    while current <= end:
        if current.weekday() < 5:
            days.append(current)
        current += dt.timedelta(days=1)
    return days
