import datetime as dt


def today() -> dt.date:
    """The platform's 'as of' date — the real current date.

    Called (not stored) so a long-running server crosses midnight correctly.
    """
    return dt.date.today()


def business_days_between(start: dt.date, end: dt.date) -> list[dt.date]:
    days = []
    current = start
    while current <= end:
        if current.weekday() < 5:
            days.append(current)
        current += dt.timedelta(days=1)
    return days
