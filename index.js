const canvasx = 1920, canvasy = 1080; //OBS canvas size is available only with *very* new obs-websocket builds. Otherwise, we assume.
let display_scale = 0.625; //Updated whenever we get a full set of new sources
let layout = null; //If set, it's the DOM node that we render the layout into. If not, don't render.

const sourcetypes = {}; //Info from GetSourceTypesList, if available (ignored if not)
let source_elements = {}; //Map a source name to its DOM element

let send_request = null; //When the socket is connected, this is a function.

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
		const update = {item: el.dataset.sourcename,
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
		//console.log("RESIZE:", el.dataset.sourcename, scale);
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
	return {item: el.dataset.sourcename, position: {
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

function set_content(elem, children) {
	while (elem.lastChild) elem.removeChild(elem.lastChild);
	if (!Array.isArray(children)) children = [children];
	for (let child of children) {
		if (child === "") continue;
		if (typeof child === "string") child = document.createTextNode(child);
		elem.appendChild(child);
	}
	return elem;
}
function build(tag, attributes, children) {
	const ret = document.createElement(tag);
	if (attributes) for (let attr in attributes) {
		if (attr.startsWith("data-")) //Simplistic - we don't transform "data-foo-bar" into "fooBar" per HTML.
			ret.dataset[attr.slice(5)] = attributes[attr];
		else ret[attr] = attributes[attr];
	}
	if (children) set_content(ret, children);
	return ret;
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
				return build("option", {value: v}, d || v);
			});
			display = build("select", {"data-prop": pfx + prop, "data-origval": val, "data-numeric": 1}, opts);
			display.value = val; //Must be done _after_ the children are added
		}
		else switch (typeof val) {
			case "boolean":
				display = build("label", 0, [prop, build("input", {
					type: "checkbox", checked: val,
					"data-prop": pfx + prop, "data-origval": val,
				})]);
				break;
			case "object": display = [prop, build("ul", 0, build_details(val, pfx + prop + "."))]; break;
			case "number": case "string":
				display = build("label", 0, [prop + " ", build("input", {
					type: typeof val === "number" ? "number" : "text",
					step: "any", //Prevent numeric fields from forcing to integer
					value: val, "data-prop": pfx + prop, "data-origval": val,
				})]);
				break;
			default: break;
		}
		items.push(build("li", null, display));
	}
	return items;
}

async function itemdetails(item) {
	const props = await send_request("GetSceneItemProperties", {item});
	delete props["message-id"]; delete props["status"]; delete props["name"];
	console.log("Got props:", props);
	set_content(document.querySelector("#itemprops ul"), build_details(props, ""));
	set_content(document.querySelector("#itemprops h3"), "Details for '" + item + "'");
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
		//After making any changes, do a full update. Simpler that way.
		const scene = await send_request("GetCurrentScene");
		update(scene.name, scene.sources);
	};
	modal.showModal();
}

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
	el.style.width = max(xfrm.width * display_scale, 15) + "px";
	el.style.height = max(xfrm.height * display_scale, 15) + "px";
	el.style.left = ((xfrm.position.x - xofs) * display_scale) + "px";
	el.style.top = ((xfrm.position.y - yofs) * display_scale) + "px";
	el.dataset.grav_x = xofs;
	el.dataset.grav_y = yofs;
	el.dataset.base_cx = xfrm.sourceWidth;
	el.dataset.base_cy = xfrm.sourceHeight;
	el.classList.toggle("locked", xfrm.locked);
	el.style.zIndex = xfrm.locked ? 1 : 1000;
}

function calc_scale() {
	const rhs = document.getElementById("layout_info");
	const width = rhs.parentElement.clientWidth - rhs.clientWidth;
	if (width <= 0) return display_scale; //Can't calculate. Don't change scale.
	const maxscale = width / canvasx;
	const scale = Math.floor(maxscale * 32) / 32; //Round down to a value that can be safely represented
	//TODO maybe: Adjust scale only if it's "different enough",
	//to avoid unnecessary churn.
	return min(scale, 0.75);
}

function update(name, sources) {
	//console.log("Sources:", sources);
	display_scale = calc_scale();
	layout.style.width = (canvasx * display_scale) + "px";
	layout.style.height = (canvasy * display_scale) + "px";
	document.getElementById("scene_name").innerText = name;
	const vol = document.getElementById("volumes").firstChild;
	vol.innerHTML = "";
	if (layout) while (layout.lastChild) resizeObserver.unobserve(layout.removeChild(layout.lastChild));
	source_elements = {};
	const item_descs = [];
	sources.forEach(source => {
		//Using forEach for the closure :)
		const typeinfo = sourcetypes[source.type];
		if (layout && typeinfo && typeinfo.caps.hasVideo) {
			//console.log(`Source: (${source.x},${source.y})-(${source.x+source.cx},${source.y+source.cy}) -- ${source.name}`);
			//TODO: If the scene item is locked, don't make it resizable (but allow lock to be toggled)
			//TODO: Correctly handle item gravity (alignment)
			const el = document.createElement("DIV");
			el.appendChild(document.createTextNode(source.name));
			el.dataset.sourcename = source.name;
			update_element(el, {
				width: source.cx, height: source.cy,
				locked: source.locked,
				//TODO: Alignment (gravity) is not provided by the SwitchScenes
				//event, nor the GetCurrentScene query. Enhance them upstream,
				//or query gravity some other way. For now, assume top-left.
				position: {alignment: source.alignment, x: source.x, y: source.y},
				sourceWidth: source.source_cx, sourceHeight: source.source_cy,
			});
			el.onpointerdown = startdragging;
			el.onpointerup = stopdragging;
			el.ondblclick = ev => itemdetails(source.name);
			resizeObserver.observe(el);
			layout.appendChild(el);
			source_elements[source.name] = el;
			item_descs.push(build("li", 0, build("button", {onclick: ev => itemdetails(source.name)}, source.name)));
			/* Maybe TODO: Put actual images on the elements. Currently freezes OBS hard (if it's even supported).
			if (show_preview_images && source.render)
				send_request("TakeSourceScreenshot", {sourceName: source.name, embedPictureFormat: "png", width: 100})
					.then(resp => {console.log("Got image for", source.name); el.style.backgroundImage = resp.img})
					.catch(err => console.error("Couldn't get image for", source.name, err));
			*/
		}
		if (typeinfo && !typeinfo.caps.hasAudio) return; //It's a non-audio source. (Note that browser sources count as non-audio, despite being able to make noises.)
		//Note that if !typeinfo, we assume no video, but DO put it on the mixer.
		const src = document.createElement("TR"); //TODO: Use build() rather than innerHTML
		src.innerHTML = "<th></th><td><input class=volslider type=range min=0 max=1 step=any></td><td><span class=percent></span><button type=button>Mute</button></td>";
		const th = src.firstChild;
		th.insertBefore(document.createTextNode(source.name), th.firstChild);
		const inp = src.querySelector("input");
		inp.value = Math.sqrt(source.volume);
		src.querySelector("span").innerText = (source.volume*100).toFixed(2);
		inp.oninput = ev => {
			const val = ev.target.value * ev.target.value;
			ev.target.closest("tr").querySelector("span").innerText = (val*100).toFixed(2);
			send_request("SetVolume", {"source": source.name, "volume": val});
		}
		src.querySelector("button").onclick = ev => {
			send_request("ToggleMute", {"source": source.name});
		}
		vol.appendChild(src);
	})
	if (layout) set_content(document.getElementById("sceneitems"), item_descs);
}

async function checksize(ev) {
	if (!ev.target.open) return; //No point rechecking when the manager is closed	
	const scale = calc_scale();
	if (scale === display_scale) return;
	//Scale has changed. Fully update everything.
	const scene = await send_request("GetCurrentScene");
	update(scene.name, scene.sources);
}

const events = {
	StreamStatus: data => {
		window.laststatus = data; //For interactive inspection
		for (const key of Object.keys(data)) {
			const dom = document.getElementById("status_" + key.split("-").join("_"));
			if (dom) dom.innerText = data[key];
		}
	},
	SwitchScenes: data => update(data["scene-name"], data.sources),
	SceneItemTransformChanged: data => {
		const el = source_elements[data["item-name"]];
		//NOTE: If a scene item is moved in OBS while being dragged here, we will
		//ignore the OBS movement and carry on regardless. This includes if you
		//hit Escape; we'll reset to where WE last saw it. This event happens in
		//response to our own dragging, so this prevents lag-induced glitchiness.
		if (!el || el === dragging) return;
		update_element(el, data.transform);
	},
	SceneItemLockedChanged: data => {
		const el = source_elements[data["item-name"]];
		if (el) {
			el.classList.toggle("locked", data["item-locked"]);
			el.style.zIndex = data["item-locked"] ? 1 : 1000;
		}
	},
};

function setup()
{
	console.log("Initializing");
	const params = /#(.*)@(.*)/.exec(window.location.hash || "");
	let server = "localhost", pwd = null;
	if (params) {server = params[2]; pwd = params[1];}
	const socket = new WebSocket("ws://" + server + ":4444/"); //Hard coded port for now
	let counter = 0;
	const pending = {};
	send_request = (type, data={}) => new Promise((res, rej) => {
		const id = "msg" + counter++;
		data = Object.assign({"request-type": type, "message-id": id}, data);
		socket.send(JSON.stringify(data));
		pending[id] = [res, rej];
	});
	window.req = (type, data) => { //For console testing
		send_request(type, data)
			.then(data => console.log(data))
			.catch(err => console.error(err));
	}
	socket.onopen = async () => {
		console.log("Connected");
		send_request("GetVersion")
			.then(data => {
				console.info("Running on OBS " + data["obs-studio-version"]
					+ " and obs-websocket " + data["obs-websocket-version"]);
				if (data["obs-websocket-version"] >= "4.3.0") {
					layout = document.getElementById("layout");
					const mgr = layout.closest("details");
					mgr.classList.remove("hidden");
					mgr.ontoggle = checksize;
					document.getElementById("sceneitems").closest("details").classList.remove("hidden");
					layout.innerHTML = "";
				}
			});
		try {
			(await send_request("GetSourceTypesList"))
				.types.forEach(type => sourcetypes[type.typeId] = type);
		} catch (err) {} //If we can't get the source types, don't bother. It's a nice-to-have only.
		const auth = await send_request("GetAuthRequired");
		if (auth.authRequired) {
			const hash = forge_sha256(pwd + auth.salt);
			const resp = forge_sha256(hash + auth.challenge);
			await send_request("Authenticate", {auth: resp}); //Will throw on auth failure
		}
		const scene = await send_request("GetCurrentScene");
		update(scene.name, scene.sources);
	}
	socket.onmessage = (ev) => {
		const data = JSON.parse(ev.data);
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
	document.getElementById("itemprops_cancel").onclick = ev => document.getElementById("itemprops").close();
}
setup();
