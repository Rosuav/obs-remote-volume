OBS Remote Control Volume Control
=================================

Plans: Connect to OBS (requires [obs-remote plugin](https://github.com/Palakis/obs-websocket)) and
allow customization of individual sources' volumes.

Since this uses WebSockets to connect, it should be able to manage OBS from
anywhere on the LAN, or potentially even the internet (subject to firewall
and/or port forwarding rules), so you'll generally want to have a password
set on the websocket.
