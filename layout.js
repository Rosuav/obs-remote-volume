import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {P} = choc; //autoimport

DOM("#layoutmode").onclick = () => {
	const win = window.open("", "toolbox", "popup=1,width=300,height=650");
	console.log(win)
	set_content(win.document.body, P("Hello, world!"));
};