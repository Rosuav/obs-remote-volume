import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {OPTION, SELECT, INPUT, LABEL, UL, LI, BUTTON, TR, TH, TD, SPAN} = choc; //autoimport
import {override_layout} from "./layout.js";
import {send_updates} from "./sections.js";

let canvasx = 1920, canvasy = 1080; //OBS canvas size is available only with fairly new obs-websocket builds. Otherwise, we take a guess.
let display_scale = 0.625; //Updated whenever we get a full set of new sources
const obsenum = {WebSocketOpCode: {0: "Hello"}}; //Seed with the only message we absolutely have to be able to comprehend initially

const sourcetypes = {}; //Info from GetSourceTypesList, if available (ignored if not)
let source_elements = {}; //Map a source name to its DOM element

let send_request = null; //When the socket is connected, this is a function.
let handshake = "guess"; //Or "v4" or "v5"
let connect_info = { }, connected = false;
const v4v5 = (v4, v5) => handshake === "v5" ? v5 : v4;

const state = { //Updated and passed along to modules
	connect_info,
	sourcetypes, source_elements,
	sources: [],
	scenes: {scenes: [], currentProgramSceneName: ""},
};
function repaint() {send_updates(state);}

if (!window.ResizeObserver) {
	//Older browsers don't have this. Prevent crashes, but don't try to actually implement anything.
	const p = (window.ResizeObserver = function(callback) { }).prototype;
	p.observe = p.unobserve = function(el) { };
}
const show_preview_images = 0;

//NOTE: Resizing when gravity is not top-left actually manipulates the position
//as well as the scale. This may be a tad odd, but it's the best we can do, short
//of implementing our own grab handles.
const resizeObserver = new ResizeObserver(entries => {
	for (let entry of entries) {
		const el = entry.target;
		const cx = entry.contentRect.width / display_scale;
		if (!el.dataset.reset_width) continue; //Suppress resize events caused by display rerendering
		//TODO: Snap to edges and/or middle of canvas or other items
		const scale = cx / el.dataset.base_cx;
		const update = {item: el.dataset.name,
			scale: {x: scale, y: scale}};
		const xofs = parseFloat(el.dataset.grav_x), yofs = parseFloat(el.dataset.grav_y);
		const rescale = scale / parseFloat(el.dataset.last_scale);
		if (xofs || yofs) update.position = {
			x: parseFloat(el.style.left) / display_scale + xofs * rescale,
			y: parseFloat(el.style.top)  / display_scale + yofs * rescale,
		};
		el.style.height = (scale * el.dataset.base_cy * display_scale) + "px";
		//NOTE: If the scene changes while you're dragging, this may set the size
		//on the wrong scene. Caveat resizor.
		send_request("SetSceneItemProperties", update);
		//console.log("RESIZE:", el.dataset.name, scale);
	}
});

function max(a, b) {return a > b ? a : b;}
function min(a, b) {return a < b ? a : b;}

//Since a div won't give me key events, we need to hook that on the document.
let dragging = null, dragreset = null;
document.onkeydown = ev => {if (ev.key === "Escape" && dragging) {
	dragging.style.width = dragging.dataset.reset_width;
	dragging.style.left = dragging.dataset.reset_left;
	dragging.style.top = dragging.dataset.reset_top;
	dragging.style.resize = "none"; //Prevent resizing until the mouse button is released
	if (dragreset !== true) send_request("SetSceneItemProperties", dragreset);
	dragreset = null; //Don't wipe dragging yet - let that happen when the button is released
}};

function drag_xfrm(el, x, y) {
	return {item: el.dataset.name, position: {
		x: x / display_scale + parseInt(el.dataset.grav_x, 10),
		y: y / display_scale + parseInt(el.dataset.grav_y, 10),
	}};
}

function keepdragging(ev) {
	if (!dragreset) return;
	//TODO: Snap to edges and/or middle of canvas or other items
	const x = ev.clientX - this.dataset.baseX;
	const y = ev.clientY - this.dataset.baseY;
	this.style.left = x + "px";
	this.style.top  = y + "px";
	send_request("SetSceneItemProperties", drag_xfrm(this, x, y));
}

function startdragging(ev) {
	if (ev.target.classList.contains("locked")) return; //No dragging locked elements.
	if (ev.ctrlKey)
	{
		//Holding Ctrl moves and won't allow resizing
		ev.preventDefault();
		const x = parseFloat(this.style.left);
		const y = parseFloat(this.style.top);
		this.dataset.baseX = ev.clientX - x;
		this.dataset.baseY = ev.clientY - y;
		this.onpointermove = keepdragging;
		this.setPointerCapture(ev.pointerId);
		dragreset = drag_xfrm(this, x, y);
	}
	else dragreset = true;
	//Without Ctrl, we might resize, if the cursor was on the grab handle.
	//Snapshot enough details for the Esc key to reset everything.
	dragging = this;
	this.dataset.reset_width = this.style.width;
	this.dataset.last_scale = parseFloat(this.style.width) / display_scale / this.dataset.base_cx;
	this.dataset.reset_left = this.style.left;
	this.dataset.reset_top = this.style.top;
}

function stopdragging(ev) {
	if (this === dragging) {
		//this.style.left = this.dataset.reset_left;
		//this.style.top = this.dataset.reset_top;
		this.style.resize = this.onpointermove = dragging = null;
		this.releasePointerCapture(ev.pointerId);
	}
}

const dropdowns = {
	"bounds.type": ["OBS_BOUNDS_NONE", "OBS_BOUNDS_STRETCH", "OBS_BOUNDS_SCALE_INNER",
		"OBS_BOUNDS_SCALE_TO_WIDTH", "OBS_BOUNDS_SCALE_TO_HEIGHT", "OBS_BOUNDS_MAX_ONLY"],
	"position.alignment": [ //Bitwise, not an enumeration per se
		"5=Top-Left", "4=Top-Center", "6=Top-Right",
		"1=Center-Left", "0=Center", "2=Center-Right",
		"9=Bottom-Left", "8=Bottom-Center", "10=Bottom-Right",
	],
};

function build_details(props, pfx) {
	const items = [];
	for (const prop in props) {
		const val = props[prop];
		let display = prop + " => " + val;
		const dd = dropdowns[pfx + prop];
		if (dd) {
			//Create a drop-down from either an array (value equals description)
			//or an object (value: description).
			const opts = dd.map(def => {
				const [v, d] = def.split("=");
				return OPTION({value: v}, d || v);
			});
			display = SELECT({"data-prop": pfx + prop, "data-origval": val, "data-numeric": 1}, opts);
			display.value = val; //Must be done _after_ the children are added
		}
		else switch (typeof val) {
			case "boolean":
				display = LABEL([prop, INPUT({
					type: "checkbox", checked: val,
					"data-prop": pfx + prop, "data-origval": val,
				})]);
				break;
			case "object": display = [prop, UL(build_details(val, pfx + prop + "."))]; break;
			case "number": case "string":
				display = LABEL([prop + " ", INPUT({
					type: typeof val === "number" ? "number" : "text",
					step: "any", //Prevent numeric fields from forcing to integer
					value: val, "data-prop": pfx + prop, "data-origval": val,
				})]);
				break;
			default: break;
		}
		items.push(LI(display));
	}
	return items;
}

async function itemdetails(item) {
	const props = await send_request("GetSceneItemProperties", {item});
	delete props["message-id"]; delete props["status"]; delete props["name"];
	console.log("Got props:", props);
	set_content("#itemprops ul", build_details(props, ""));
	set_content("#itemprops h3", "Details for '" + item + "'");
	const modal = document.getElementById("itemprops");
	document.getElementById("itemprops_apply").onclick = async ev => {
		console.log("Applying changes to item", item);
		const updates = {}; let changes = 0;
		modal.querySelectorAll("[data-prop]").forEach(el => {
			let val = el.type === "checkbox" ? el.checked : el.value;
			if (""+val === el.dataset.origval) return;
			if (el.type === "number" || el.dataset.numeric) val = parseFloat(val);
			const path = el.dataset.prop.split(".");
			const leaf = path.pop();
			let target = updates;
			for (let p of path) {
				if (!target[p]) target[p] = {};
				target = target[p];
			}
			target[leaf] = val;
			++changes;
		});
		modal.close();
		if (!changes) {console.log("No changes"); return;}
		console.log("Updating", item, updates);
		updates.item = item;
		await send_request("SetSceneItemProperties", updates);
		full_update(); //After making any changes, do a full update. Simpler that way.
	};
	modal.showModal();
}
on("click", ".sceneelembtn", e => itemdetails(e.match.dataset.name));
on("dblclick", ".sceneelement", e => itemdetails(e.match.dataset.name));

function update_element(el, xfrm) {
	//Default to top-left if obs-websocket doesn't give the actual alignment
	if (xfrm.position.alignment === undefined) xfrm.position.alignment = 5;
	let xofs = xfrm.width;
	switch (xfrm.position.alignment & 3) {
		case 1: xofs = 0; break; //Left
		case 0: xofs /= 2; break; //Center
		case 2: break; //Right
	}
	let yofs = xfrm.height;
	switch (xfrm.position.alignment & 12) {
		case 4: yofs = 0; break; //Top
		case 0: yofs /= 2; break; //Center
		case 8: break; //Bottom
	}
	let left = xfrm.position.x - xofs, top = xfrm.position.y - yofs;
	let right = left + xfrm.width, bottom = top + xfrm.height;
	if (left < 0) left = 0; if (top < 0) top = 0;
	if (right >= canvasx) right = canvasx - 1;
	if (bottom >= canvasy) bottom = canvasy - 1;
	el.style.width = max((right - left) * display_scale, 15) + "px";
	el.style.height = max((bottom - top) * display_scale, 15) + "px";
	el.style.left = (left * display_scale) + "px";
	el.style.top = (top * display_scale) + "px";
	el.dataset.grav_x = xofs;
	el.dataset.grav_y = yofs;
	el.dataset.base_cx = xfrm.sourceWidth;
	el.dataset.base_cy = xfrm.sourceHeight;
	el.classList.toggle("locked", xfrm.locked);
	el.style.zIndex = xfrm.locked ? 1 : 1000;
}

async function set_bg_img(el, sourcename, width) {
	try {
		const resp = await send_request("TakeSourceScreenshot", {sourceName: sourcename, embedPictureFormat: "png", width});
		console.log("Got image for", sourcename);
		el.style.backgroundImage = "url(" + resp.img + ")";
		el.style.opacity="0.25";
	}
	catch (err) {console.error("Couldn't get image for", source.name, err);}
}

function update(sources) {
	state.source_elements = source_elements = {};
	state.sources = sources;
	repaint();
}

async function full_update() {
	const scenes = await send_request("GetSceneList");
	state.scenes = scenes;
	if (handshake === "v4") {
		const scene = await send_request("GetCurrentScene");
		scenes.currentProgramSceneName = scenes["current-scene"];
		scenes.scenes = scenes.scenes.map(s => ({sceneName: s.name}));
		update(scene.sources);
	} else {
		scenes.scenes.reverse(); //HACK: Currently, OBS WS v5 seems to return them in the wrong order.
		const scenename = scenes.currentProgramSceneName;
		//TODO: Create scene selection buttons for scenes.scenes[].sceneName
		const sceneitems = (await send_request("GetSceneItemList", {sceneName: scenename})).sceneItems;
		const volumes = await send_request("GetInputVolume",
			sceneitems.map(i => ({inputName: i.sourceName})),
			"RequestBatch");
		volumes.forEach((v, i) => {
			const item = sceneitems[i];
			const t = sourcetypes[item.inputKind] = {caps: { }};
			//Requests that succeed definitely indicate input kinds that have audio.
			//We assume for now that failure is caused by the input not having
			//audio, although it's possible there are other errors.
			t.caps.hasAudio = v.requestStatus.result;
			if (t.caps.hasAudio) item.volume = v.responseData.inputVolumeMul;
		});
		update(sceneitems);
	}
}

//TODO: Design a generic debounce circuit.
//1. When a command is sent to OBS, record the timestamp 100ms later.
//2. When a status message is received, if within the 100ms window, defer until
//   after that window. Retrigger the status message (last one only) when that
//   window closes.
//3. Different signals for the same source, or the same signal for another, are
//   completely independent. Gonna be a lot of setTimeout.
//Note: Only necessary where fighting is a possibility. Don't bother doing this
//for mute status.
const sent_volume_signal = { };
on("input", ".volslider", e => {
	const val = e.match.value ** 2;
	const tr = e.match.closest("tr");
	tr.querySelector("span").innerText = (val*100).toFixed(2);
	sent_volume_signal[tr.dataset.name] = +new Date;
	send_request(v4v5("SetVolume", "SetInputVolume"), {
		[v4v5("source", "inputName")]: tr.dataset.name,
		[v4v5("volume", "inputVolumeMul")]: val,
	});
});
on("click", ".mutebtn", e => send_request("ToggleMute", {"source": e.match.closest("tr").dataset.name}));

on("click", "[data-sceneselect]", e =>
	send_request(v4v5("SetCurrentScene", "SetCurrentProgramScene"),
		{[v4v5("scene-name", "sceneName")]: e.match.dataset.sceneselect}));

const events = {
	SwitchScenes: data => { //v4
		state.scenes.currentProgramSceneName = data["scene-name"];
		update(data.sources);
	},
	CurrentProgramSceneChanged: data => { //v5
		state.scenes.currentProgramSceneName = data.sceneName;
		repaint();
		full_update();
	},
	SceneItemTransformChanged: data => { //v4
		const el = source_elements[data["item-name"]];
		//NOTE: If a scene item is moved in OBS while being dragged here, we will
		//ignore the OBS movement and carry on regardless. This includes if you
		//hit Escape; we'll reset to where WE last saw it. This event happens in
		//response to our own dragging, so this prevents lag-induced glitchiness.
		if (!el || el === dragging) return;
		update_element(el, data.transform);
	},
	SceneItemLockChanged: data => { //v4
		const el = source_elements[data["item-name"]];
		if (el) {
			el.classList.toggle("locked", data["item-locked"]);
			el.style.zIndex = data["item-locked"] ? 1 : 1000;
		}
	},
	SourceMuteStateChanged: data => { //v4
		const el = source_elements["!mute-" + data["sourceName"]];
		if (el) el.innerText = data.muted ? "Unmute" : "Mute";
	},
	InputVolumeChanged: data => { //v5
		if (sent_volume_signal[data.inputName] + 100 > +new Date) return; //For 100ms after sending a volume signal, don't accept them back.
		//TODO: Have a quick way to look up a scene element by name
		state.sources.forEach(source => source.sourceName === data.inputName && (source.volume = data.inputVolumeMul));
		//TODO: Have an easy way to say "minor changes only, update existing DOM elements"
		repaint();
	},
};

function parse_uri(string) {
	//Parse the URI and put the components into the other fields
	const uri = /^([a-z]+:\/\/)?(?:([^@]*)@)?([^:/]+)(?::([0-9]+))?\/?(.*)$/.exec(string);
	if (!uri) return "Unparseable";
	const [_, proto, pwd1, ip, port, pwd2] = uri;
	const ssl = ["obswss://", "wss://", "ssl://", "https://"].includes(proto);
	const v5 = ["obswss://", "obsws://"].includes(proto);
	state.connect_info = connect_info = {ssl, v5, ip, port: port || (v5 ? 4455 : 4444), password: pwd1 || pwd2 || ""};
	build_uri();
}
function build_uri() {
	const proto = (
		(connect_info.v5 ? "obsws" : "ws") +
		(connect_info.ssl ? "s" : "")
	);
	connect_info.uri = `${proto}://${connect_info.ip}:${connect_info.port}/${connect_info.password}`;
}

on("input", "[data-subtype=connect] input", e => {
	if (e.match.id === "uri") parse_uri(e.match.value);
	else {
		connect_info[e.match.id] = e.match[e.match.type === "checkbox" ? "checked" : "value"];
		build_uri();
	}
	repaint();
});

async function protofetch() {
	//Is this the best URL to use? Should we lock to a specific version tag rather than master?
	const url = "https://raw.githubusercontent.com/obsproject/obs-websocket/master/docs/generated/protocol.json";
	const data = await (await fetch(url)).json();
	data.enums.forEach(e => {
		const en = obsenum[e.enumType] = { };
		e.enumIdentifiers.forEach(id => {
			en[id.enumIdentifier] = id.enumValue;
			en[id.enumValue] = id.enumIdentifier; //Reverse mapping for console output
		});
	});
	console.log(obsenum);
	window.obsenum = obsenum;
}
const protocol_fetched = protofetch();

function rerender() {
	if (connected) override_layout(null);
	else override_layout({type: "section", subtype: "connect"});
	repaint();
}
function setup(uri)
{
	//handshake = "guess"; //TODO: Have a good default that lets people not specify protocol
	handshake = connect_info.v5 ? "v5" : "v4";
	const proto = connect_info.ssl ? "wss://" : "ws://";
	const server = connect_info.ip, pwd = connect_info.password, port = connect_info.port;
	history.replaceState(null, "", "#" + connect_info.uri);
	console.log("Connect to", proto + server, port, "handshake", handshake)
	const socket = new WebSocket(proto + server + ":" + port);
	let counter = 0;
	const pending = {}, responseids = {};
	let hello_msg = null;
	send_request = (type, data={}, op=6) => new Promise((res, rej) => {
		if (socket.readyState !== 1) return rej("Socket not open");
		const id = "msg" + counter++;
		if (op === 6) {
			//Standard request.
			if (handshake === "v4") data = {"request-type": type, "message-id": id, ...data};
			else data = {op, d: {requestType: type, requestId: id, requestData: data}};
		} else if (op === "RequestBatch") {
			//Batch of requests. Give it a single ID, and return the array of responses.
			if (handshake === "v4") return rej("Batches are a v5 feature.");
			data = {op: obsenum.WebSocketOpCode[op], d: {
				requestId: id,
				requests: data.map(r => ({requestType: type, requestData: r})),
			}};
		} else {
			//Some other sort of message. Pass the textual or numeric opcode as the op.
			//The type here is actually the (textual) opcode of the response (if null, no response needed).
			if (typeof op !== "number") op = obsenum.WebSocketOpCode[op];
			if (type) responseids[type] = id;
			data = {op, d: data};
		}
		pending[id] = [res, rej];
		//Special case: GetAuthRequired is not a message in v5
		if (handshake === "v5" && type === "GetAuthRequired") {
			if (hello_msg) res(hello_msg); //Got it already? Respond immediately.
			else responseids["Hello"] = id; //Wait for the server to send it.
			return;
		}
		//console.log("Sending", data);
		socket.send(JSON.stringify(data));
	});
	window.req = (type, data) => { //For console testing
		send_request(type, data)
			.then(data => console.log(data))
			.catch(err => console.error(err));
	}
	let handshake_guess;
	socket.onopen = async () => {
		console.log("Connected");
		if (handshake === "guess") handshake = await new Promise(r => setTimeout(handshake_guess = r, 100, "v4"));
		handshake_guess = null;
		if (handshake === "v5") await protocol_fetched; //Ensure that we have the enumerations available
		const auth = await send_request("GetAuthRequired");
		if (auth.authRequired || auth.authentication) {
			const authinfo = auth.authentication || auth;
			const hash = forge_sha256(pwd + authinfo.salt);
			const resp = forge_sha256(hash + authinfo.challenge);
			if (handshake === "v5") await send_request("Identified", {rpcVersion: 1, authentication: resp}, "Identify");
			else await send_request("Authenticate", {auth: resp}); //Will throw on auth failure
		}
		const ver = await send_request("GetVersion");
		const obsver = ver[v4v5("obs-studio-version", "obsVersion")];
		console.info("Running on OBS " + obsver + " and obs-websocket " + ver[v4v5("obs-websocket-version", "obsWebSocketVersion")]);
		if (handshake === "v4") try {
			(await send_request("GetSourceTypesList"))
				.types.forEach(type => sourcetypes[type.typeId] = type);
		} catch (err) {} //If we can't get the source types, don't bother. It's a nice-to-have only.
		//else (await send_request("GetInputKindList")).inputKinds.forEach( //Currently there's no capabilities on the input kinds
		if (obsver >= "4.6.0") {
			const vidinfo = await send_request(v4v5("GetVideoInfo", "GetVideoSettings"));
			canvasx = vidinfo.baseWidth; canvasy = vidinfo.baseHeight;
		}
		connected = true;
		rerender();
		full_update();
	}
	socket.onmessage = (ev) => {
		const data = JSON.parse(ev.data);
		if (handshake_guess && data.op !== undefined && data.d) handshake_guess(handshake = "v5");
		if (handshake === "v5") {
			const opcode = obsenum.WebSocketOpCode[data.op]; //Textual version
			let ret = data.d, fail = 0;
			//console.log("v5 message", opcode, data.d);
			if (opcode === "Hello") hello_msg = data.d;
			let id = responseids[opcode];
			if (id) delete responseids[opcode];
			else if (opcode === "RequestResponse") {
				id = data.d.requestId;
				if (data.d.requestStatus.result) ret = data.d.responseData;
				else fail = 1; //Return the full raw data.d dump
			}
			else if (opcode === "RequestBatchResponse") [id, ret] = [data.d.requestId, data.d.results];
			else if (opcode === "Event") {
				const func = events[data.d.eventType];
				if (func) return func(data.d.eventData);
				console.log("Unknown event:", data.d.eventType, data.d.eventData);
				events[data.d.eventType] = () => {};
			}
			if (pending[id]) {
				pending[id][fail](ret);
				delete pending[id];
			}
			return;
		}
		if (data["update-type"])
		{
			const func = events[data["update-type"]];
			if (func) return func(data);
			//Unknown events get logged once and then no more.
			console.log("Unknown event:", data["update-type"], data);
			events[data["update-type"]] = () => {};
			return;
		}
		if (data["message-id"]) {
			const resrej = pending[data["message-id"]];
			if (!resrej) return; //Response to an unknown message
			delete pending[data["message-id"]];
			if (data.status === "ok") resrej[0](data); //Resolve
			else resrej[1](data); //Reject
			return;
		}
		console.log("Unknown packet:", data);
	};
	socket.onclose = () => {
		console.log("Socket closed");
		connected = false;
		rerender();
	};
}
rerender();
const hash = (window.location.hash || "#").slice(1);
if (hash) {parse_uri(hash); setup();}
on("click", "#reconnect", e => setup(DOM("#uri").value));

/* TODO: Hide the user's password.
- Don't have the URI in the hash after connecting - just retain it internally
- If possible, hide the password in the URI input while connecting, too
*/
