"""Numbers the synthetic cohort is drawn from, with where each one comes from.

Leave rates come from Canadian emergency department data. Relative effects
(triage level, age, arrival hour, ambulance) come from US NHAMCS 2019-2022 ED
visits, because no open Canadian visit-level file has them. Everything marked
"demo assumption" is a placeholder for the site to replace. None of this is a
validated risk model: it only makes the synthetic waiting room look plausible.
"""

from __future__ import annotations

LEAVE_RATE_TARGET = 0.07
"""Share of visits that leave without being seen.

Between Alberta (4.1% of presentations to 16 high-volume EDs, 4.8% at academic
sites, 2010-2015; McRae et al., BMC Health Serv Res 2020,
https://pmc.ncbi.nlm.nih.gov/articles/PMC7183635) and The Ottawa Hospital
(9.1%, 2022-2024; https://pmc.ncbi.nlm.nih.gov/articles/PMC12815564). Foothills
is an academic site under post-pandemic crowding, so the demo uses 7%.
"""

CROWDING_OR_PER_5_WAITING = 1.169
"""Odds ratio for leaving per 5 more patients waiting at arrival (Ottawa, adjusted)."""

# Relative leave rates from NHAMCS 2019-2022, survey-weighted, adults with a
# recorded triage level of 2-5 (34,385 visits, 417 left without being seen).
# NHAMCS uses an ESI-like five-level scale, used here as a stand-in for CTAS.
TRIAGE_RELATIVE_RATE = {2: 0.61, 3: 1.02, 4: 1.09, 5: 2.12}
AGE_RELATIVE_RATE = ((29, 1.25), (44, 1.47), (64, 1.01), (200, 0.31))
"""(upper age bound, relative rate), checked in order."""
EVENING_RELATIVE_RATE = 1.27
"""Arrival 18:00-23:59 local time."""
DAYTIME_RELATIVE_RATE = 0.90
AMBULANCE_RELATIVE_RATE = 0.69
WALK_IN_RELATIVE_RATE = 1.08

LEAVE_DELAY_QUANTILES = ((0.0, 20), (0.10, 42), (0.25, 81), (0.50, 154), (0.75, 276), (0.90, 424), (1.0, 600))
"""Minutes from arrival to leaving, for visits that left without being seen.

NHAMCS 2019-2022 length of visit for those visits (10th to 90th percentile).
The 0 and 100% ends are demo assumptions.
"""

# Demo assumptions about who is in a Calgary adult waiting room.
CTAS_MIX = {2: 0.20, 3: 0.50, 4: 0.25, 5: 0.05}
AGE_BANDS = (((18, 29), 0.22), ((30, 44), 0.26), ((45, 64), 0.30), ((65, 92), 0.22))
LANGUAGE_MIX = {"en": 0.84, "pa": 0.09, "tl": 0.07}
PAGER_SHARE = 0.15
AMBULANCE_SHARE = 0.20
COMPANION_DEVICE_SHARE = 0.25
"""Share of app visits where a companion holds the signed-in device."""

CHECKIN_ON_TIME = 0.75
"""Chance a prompt is answered within a few minutes of being due."""
CHECKIN_LATE = 0.50
"""Of prompts not answered on time, the chance of a late answer (15-60 minutes) rather than none."""

TRAJECTORY_MIX = {"stable": 0.65, "improving": 0.15, "worsening": 0.20}
WORSENING_FINDING_SHARE = 0.25
"""Of worsening visits, the share that report a new warning sign."""

ROOMED_SHARE = 0.15
"""Share of the generated visits already moved into the department at load time."""

STAFF_LATE_MEAN_MINUTES = 10
"""Mean lateness of a staff reassessment after it falls due."""
STAFF_VERY_LATE_SHARE = 0.15
"""Share of reassessments 30-60 minutes late, so some show as overdue."""

# Demo acknowledgement deadlines, matching the web mocks.
ACK_MINUTES = {"red": 2, "amber": 10, "silent": 10, "leave_risk": 10, "overdue": 10}
SILENT_AFTER_MINUTES = 5
"""A prompt this many minutes overdue opens a missed check-in task."""
