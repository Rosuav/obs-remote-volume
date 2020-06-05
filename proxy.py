# Set up a basic TLS proxy in front of the OBS Websocket
# Requires Python 3.7 or greater.

# To encrypt the connection, you will need a valid certificate from
# a source that the browser will trust. One good option is LetsEncrypt
# which doesn't cost anything and can easily be automated. However,
# it may be necessary to reformat the private key.
# openssl rsa -in testkey.pem -out privkey.pem
CERT_FILE = "certificate.pem"
KEY_FILE = "privkey.pem"
LISTEN_PORT = 4445 # Use wss://my.host.name.example:4445/ to connect
REAL_PORT = 4444 # The port number configured in OBS Websocket itself

import asyncio
import ssl

context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)

async def forward(reader, writer):
	while "connected":
		data = await reader.read(100)
		if not data: break
		print(f"Received {data!r}")
		writer.write(data)
		await writer.drain()
	writer.close()

async def connected(client_reader, client_writer):
	obs_reader, obs_writer = await asyncio.open_connection('127.0.0.1', REAL_PORT)
	asyncio.create_task(forward(client_reader, obs_writer))
	asyncio.create_task(forward(obs_reader, client_writer))

async def main():
	server = await asyncio.start_server(connected, '', LISTEN_PORT, ssl=context)
	addr = server.sockets[0].getsockname()
	print('Serving on ', addr)

	async with server:
		await server.serve_forever()

asyncio.run(main())
