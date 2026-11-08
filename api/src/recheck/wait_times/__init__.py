"""Department wait estimates from the AHS public feed.

`ahs` parses the feed, `estimate` decides what the patient screen shows, and
`poller` is the worker that stores a snapshot for each mapped site every five
minutes.
"""
