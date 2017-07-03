function setup()
{
	console.log("Initializing");
	const socket = new WebSocket("ws://localhost:4444/"); //Hard coded for now
	socket.onopen = () => console.log("Connected");
	//const announce_pos = (n) => socket.send(JSON.stringify({type: "setpos", data: n}))
	socket.onmessage = (ev) => {
		const data = JSON.parse(ev.data);
		console.log("Packet received and decoded:", data); //PRAD - https://www.theregister.co.uk/2002/02/18/the_bastard_guide_to_writing/
	};
}
