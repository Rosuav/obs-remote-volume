OBS Remote Control Volume Control
=================================

Connects to OBS Studio via its WebSocket connection and offers various configs
including adjusting the volumes of different sources, scene selection, and
even starting and stopping the broadcast.

Since this uses WebSockets to connect, it should be able to manage OBS from
anywhere on the LAN, or potentially even the internet (subject to firewall
and/or port forwarding rules), so you'll generally want to have a password
set on the websocket.

To connect to OBS running on localhost, easy - no encryption needed. To connect
to an OBS on the internet, you will need to encrypt the traffic. This will
require an SSL certificate and a reverse proxy; one is included here, and
others are available on the internet. For LAN access, you may be able to use
unencrypted connections, if and only if the host is specified by IP address;
otherwise, encryption will be required. To connect to any sort of encrypted
websocket, check the "SSL" box before connecting.


License: MIT

The code in this repository, with the exception of forge_sha256.js, is all
copyright (c) 2017-2026, Chris Angelico. 

Permission is hereby granted, free of charge, to any person obtaining a copy of 
this software and associated documentation files (the "Software"), to deal in 
the Software without restriction, including without limitation the rights to 
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies 
of the Software, and to permit persons to whom the Software is furnished to do 
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all 
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE 
SOFTWARE.
