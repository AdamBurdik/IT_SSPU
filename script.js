function detectRepo() {
	const host = window.location.hostname;
	const path = window.location.pathname;
	if (!host.endsWith('github.io')) return null;

	const owner = host.split('.')[0];
	const name = path.split('/').filter(Boolean)[0];
	if (!owner || !name) return null;

	return { owner, name };
}

const REPO = detectRepo() || { owner: 'Studenti-SSPU-Opava', name: 'IT_SSPU' };

const repoUrl = `https://github.com/${REPO.owner}/${REPO.name}`;
document.getElementById('repo-link')?.setAttribute('href', repoUrl);
document.getElementById('wiki-link')?.setAttribute('href', repoUrl + '/wiki');

function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dirPathOf(filePath) {
	const idx = filePath.lastIndexOf('/');
	return idx === -1 ? '' : filePath.slice(0, idx);
}

function isImage(filePath) {
	return /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(filePath);
}

function isHtml(filePath) {
	return /\.html?$/i.test(filePath);
}

function isAbsoluteUrl(val) {
	return /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|data:)/i.test(val);
}

function stripLiquidRaw(html) {
	return html.replace(/\{%\s*raw\s*%\}|\{%\s*endraw\s*%\}/gi, '');
}

function fixRelativeLinks(html, baseDir) {
	const wrapper = document.createElement('div');
	wrapper.innerHTML = html;

	for (const el of wrapper.querySelectorAll('img[src], a[href]')) {
		const attr = el.tagName === 'IMG' ? 'src' : 'href';
		const val = el.getAttribute(attr);
		if (!val || isAbsoluteUrl(val)) continue;

		const cleaned = val.replace(/^\.\//, '');
		el.setAttribute(attr, (baseDir ? baseDir + '/' : '') + cleaned);
	}

	return wrapper.innerHTML;
}

function iconFor(name) {
	if (name.endsWith('.md')) return '📝';
	if (name.endsWith('.html')) return '🌐';
	if (name.endsWith('.css')) return '🎨';
	if (name.endsWith('.js')) return '⚙️';
	if (name.endsWith('.py')) return '🐍';
	if (name.endsWith('.c')) return '🔧';
	if (name.endsWith('.pdf')) return '📄';
	if (isImage(name)) return '🖼️';
	return '📄';
}

async function listDir(path) {
	const cacheKey = 'dir:' + path;
	const cached = sessionStorage.getItem(cacheKey);
	if (cached) {
		try {
			return JSON.parse(cached);
		} catch (e) {}
	}

	const url = `https://api.github.com/repos/${REPO.owner}/${REPO.name}/contents${path ? '/' + encodeURIComponent(path) : ''}`;
	const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });

	if (res.status === 403) {
		throw new Error('GitHub si teď dal pauzu (vyčerpaný limit požadavků). Zkus to za pár minut.');
	}
	if (!res.ok) {
		throw new Error(`Soubor se nepodařilo stáhnout (kód ${res.status}).`);
	}

	const data = await res.json();
	sessionStorage.setItem(cacheKey, JSON.stringify(data));
	return data;
}

function buildBreadcrumb(path) {
	const parts = path ? path.split('/') : [];
	const crumb = document.createElement('nav');
	crumb.className = 'breadcrumb';

	const root = document.createElement('a');
	root.href = '#/';
	root.textContent = 'root';
	crumb.appendChild(root);

	let acc = '';
	for (const part of parts) {
		acc += (acc ? '/' : '') + part;
		const sep = document.createElement('span');
		sep.className = 'sep';
		sep.textContent = ' / ';
		crumb.appendChild(sep);

		const a = document.createElement('a');
		a.href = '#/' + acc + '/';
		a.textContent = part;
		crumb.appendChild(a);
	}
	return crumb;
}

function makeEntry(entry) {
	const isDir = entry.type === 'dir';
	const a = document.createElement('a');
	a.className = 'entry ' + (isDir ? 'dir' : 'file');
	a.href = '#/' + entry.path + (isDir ? '/' : '');

	const icon = document.createElement('span');
	icon.className = 'entry-icon';
	icon.textContent = isDir ? '📁' : iconFor(entry.name);
	a.appendChild(icon);

	const name = document.createElement('span');
	name.className = 'entry-name';
	name.textContent = entry.name;
	a.appendChild(name);

	if (isDir) {
		const arrow = document.createElement('span');
		arrow.className = 'entry-arrow';
		arrow.textContent = '›';
		a.appendChild(arrow);
	}

	return a;
}

async function showListing(viewer, path) {
	viewer.innerHTML = '<p class="loading">Chvilku, koukám, co tady je…</p>';

	try {
		const entries = await listDir(path);
		viewer.innerHTML = '';

		viewer.appendChild(buildBreadcrumb(path));

		const heading = document.createElement('h2');
		heading.className = 'page-title';
		const title = path ? decodeURIComponent(path.split('/').pop()) : 'Vyber si soubor nebo složku';
		heading.textContent = title;
		viewer.appendChild(heading);

		if (!entries.length) {
			const empty = document.createElement('p');
			empty.className = 'empty';
			empty.textContent = 'Tady je zatím pusto, nic tu není.';
			viewer.appendChild(empty);
			return;
		}

		const byName = (a, b) => a.name.localeCompare(b.name, 'cs');
		const dirs = entries.filter(e => e.type === 'dir').sort(byName);
		const files = entries.filter(e => e.type === 'file').sort(byName);

		const list = document.createElement('div');
		list.className = 'file-list';

		for (const d of dirs) list.appendChild(makeEntry(d));
		for (const f of files) list.appendChild(makeEntry(f));

		viewer.appendChild(list);
	} catch (err) {
		viewer.innerHTML = `<div class="error"><h2>Něco se nepovedlo</h2><p>${escapeHtml(err.message)}</p></div>`;
	}
}

function buildHtmlViewer(filePath, text) {
	const wrapper = document.createElement('div');
	wrapper.className = 'html-viewer';

	const toggle = document.createElement('div');
	toggle.className = 'view-toggle';

	const codeBtn = document.createElement('button');
	codeBtn.type = 'button';
	codeBtn.className = 'view-toggle-btn active';
	codeBtn.textContent = 'Kód';
	codeBtn.dataset.view = 'code';

	const previewBtn = document.createElement('button');
	previewBtn.type = 'button';
	previewBtn.className = 'view-toggle-btn';
	previewBtn.textContent = 'Náhled';
	previewBtn.dataset.view = 'preview';

	toggle.appendChild(codeBtn);
	toggle.appendChild(previewBtn);

	const openTab = document.createElement('a');
	openTab.className = 'open-tab';
	openTab.href = filePath;
	openTab.target = '_blank';
	openTab.rel = 'noopener';
	openTab.textContent = 'Otevřít v nové kartě';

	const bar = document.createElement('div');
	bar.className = 'view-bar';
	bar.appendChild(toggle);
	bar.appendChild(openTab);
	wrapper.appendChild(bar);

	const codeView = document.createElement('pre');
	codeView.className = 'view-pane code';
	const code = document.createElement('code');
	code.textContent = text;
	codeView.appendChild(code);
	wrapper.appendChild(codeView);

	const previewView = document.createElement('div');
	previewView.className = 'view-pane preview';
	previewView.hidden = true;
	const frame = document.createElement('iframe');
	frame.src = filePath;
	frame.title = fileNameFor(frame.src);
	previewView.appendChild(frame);
	wrapper.appendChild(previewView);

	toggle.addEventListener('click', (e) => {
		const btn = e.target.closest('.view-toggle-btn');
		if (!btn) return;

		for (const b of toggle.querySelectorAll('.view-toggle-btn')) {
			b.classList.toggle('active', b === btn);
		}

		codeView.hidden = btn.dataset.view !== 'code';
		previewView.hidden = btn.dataset.view !== 'preview';
	});

	return wrapper;
}

function fileNameFor(path) {
	return decodeURIComponent(path.split('/').pop());
}

async function fetchFile(filePath) {
	const res = await fetch(filePath);
	if (res.ok) return res.text();

	if (res.status === 404) {
		const raw = `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/main/${filePath}`;
		const rawRes = await fetch(raw);
		if (rawRes.ok) return rawRes.text();
		throw new Error(`Soubor se nepodařilo stáhnout (kód ${rawRes.status}).`);
	}

	throw new Error(`Soubor se nepodařilo stáhnout (kód ${res.status}).`);
}

async function showFile(viewer, filePath) {
	viewer.innerHTML = '<p class="loading">Moment, otevírám soubor…</p>';

	try {
		const text = await fetchFile(filePath);
		viewer.innerHTML = '';

		const fileName = decodeURIComponent(filePath.split('/').pop());
		const parentDir = dirPathOf(filePath);

		viewer.appendChild(buildBreadcrumb(parentDir));

		const heading = document.createElement('h2');
		heading.className = 'page-title';
		heading.textContent = fileName;
		viewer.appendChild(heading);

		const card = document.createElement('div');
		card.className = 'card';

		if (isImage(filePath)) {
			const img = document.createElement('img');
			img.src = filePath;
			img.alt = fileName;
			card.appendChild(img);
		} else if (filePath.endsWith('.md')) {
			card.innerHTML = fixRelativeLinks(stripLiquidRaw(marked.parse(text)), parentDir);
		} else if (isHtml(filePath)) {
			card.appendChild(buildHtmlViewer(filePath, text));
		} else {
			const pre = document.createElement('pre');
			const code = document.createElement('code');
			code.textContent = text;
			pre.appendChild(code);
			card.appendChild(pre);
		}

		viewer.appendChild(card);
	} catch (error) {
		console.log(error);
		viewer.innerHTML = `<div class="error"><h1>Tenhle soubor tu není</h1><p>Nepovedlo se ho načíst: <code>${escapeHtml(filePath)}</code></p></div>`;
	}
}

async function handleRoute() {
	const viewer = document.getElementById('viewer');

	const hash = window.location.hash;

	if (!hash || hash === '#/') {
		await showListing(viewer, '');
		return;
	}

	const filePath = hash.replace(/^#\/?/, '');

	if (filePath.endsWith('/')) {
		await showListing(viewer, filePath.replace(/\/$/, ''));
		return;
	}

	await showFile(viewer, filePath);
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);
