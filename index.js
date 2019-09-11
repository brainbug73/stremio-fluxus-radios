const { config, proxy } = require('internal')
const hls = require('./hls')

const defaults = {
	name: 'Fluxus Radios',
	prefix: 'fluxusradios_',
	icon: 'https://3.bp.blogspot.com/-FpstPKST3TY/XJRmE7BmF9I/AAAAAAAAERY/ijxe44PpW44-poO8lJtn6DDosT8NTdF9ACLcBGAs/s1600/NewFTV-Radio-C.png',
	paginate: 100
}

hls.init({ prefix: defaults.prefix, type: 'radios', config })

const types = [
	{
		name: 'Fluxus Radios',
		logo: 'https://3.bp.blogspot.com/-FpstPKST3TY/XJRmE7BmF9I/AAAAAAAAERY/ijxe44PpW44-poO8lJtn6DDosT8NTdF9ACLcBGAs/s1600/NewFTV-Radio-C.png',
		m3u: 'https://pastebin.com/raw/d5cb3Wxw'
	},
]

const catalogs = []

if (config.style == 'Catalogs')
	for (let i = 0; types[i]; i++)
		if (types[i].m3u)
			catalogs.push({
				name: types[i].name,
				id: defaults.prefix + 'cat_' + i,
				type: 'radios',
				extra: [ { name: 'search' }, { name: 'skip' } ]
			})

function btoa(str) {
    var buffer;

    if (str instanceof Buffer) {
      buffer = str;
    } else {
      buffer = Buffer.from(str.toString(), 'binary');
    }

    return buffer.toString('base64');
}

function atob(str) {
    return Buffer.from(str, 'base64').toString('binary');
}

const { addonBuilder, getInterface, getRouter } = require('stremio-addon-sdk')

if (!catalogs.length)
	catalogs.push({
		id: defaults.prefix + 'cat',
		name: defaults.name,
		type: 'radios',
		extra: [{ name: 'search' }]
	})

const metaTypes = ['radios']

if (config.style == 'Channels')
	metaTypes.push('channel')
else
	metaTypes.push('tv')

const builder = new addonBuilder({
	id: 'org.' + defaults.name.toLowerCase().replace(/[^a-z]+/g,''),
	version: '1.0.0',
	name: defaults.name,
	description: 'More then 1000 free radio channels from Fluxus.',
	resources: ['stream', 'meta', 'catalog'],
	types: metaTypes,
	idPrefixes: [defaults.prefix],
	icon: defaults.icon,
	catalogs
})

builder.defineCatalogHandler(args => {
	return new Promise((resolve, reject) => {
		const extra = args.extra || {}

		if (config.style == 'Channels') {

			const metas = []

			for (let i = 0; types[i]; i++)
				if (types[i].m3u)
					metas.push({
						name: types[i].name,
						id: defaults.prefix + i,
						type: 'channel',
						poster: types[i].logo,
						posterShape: 'landscape',
						background: types[i].logo,
						logo: types[i].logo
					})

			if (metas.length) {
				if (extra.search) {
					let results = []
					metas.forEach(meta => {
						if (meta.name && meta.name.toLowerCase().includes(extra.search.toLowerCase()))
							results.push(meta)
					})
					if (results.length)
						resolve({ metas: results })
					else
						reject(defaults.name + ' - No search results for: ' + extra.search)
				} else
					resolve({ metas })
			} else
				reject(defaults.name + ' - No M3U URLs set')

		} else if (config.style == 'Catalogs') {

			const skip = parseInt(extra.skip || 0)
			const id = args.id.replace(defaults.prefix + 'cat_', '')

			hls.getM3U((types[id] || {}).m3u, id).then(metas => {
				if (!metas.length)
					reject(defaults.name + ' - Could not get items from M3U playlist: ' + args.id)
				else {
					if (!extra.search)
						resolve({ metas: metas.slice(skip, skip + defaults.paginate).map(el => { el.type = 'tv'; return el }) })
					else {
						let results = []
						metas.forEach(meta => {
							if (meta.name && meta.name.toLowerCase().includes(extra.search.toLowerCase()))
								results.push(meta)
						})
						if (results.length)
							resolve({ metas: results.map(el => { el.type = 'tv'; return el }) })
						else
							reject(defaults.name + ' - No search results for: ' + extra.search)
					}
				}
			}).catch(err => {
				reject(err)
			})
		}
	})
})

builder.defineMetaHandler(args => {
	return new Promise((resolve, reject) => {
		if (config.style == 'Channels') {
			const i = args.id.replace(defaults.prefix, '')
			const meta = {
				name: types[i].name,
				id: defaults.prefix + i,
				type: 'channel',
				poster: types[i].logo,
				posterShape: 'landscape',
				background: types[i].logo,
				logo: types[i].logo
			}
			hls.getM3U(types[i].m3u).then(videos => {
				meta.videos = videos
				resolve({ meta })
			}).catch(err => {
				reject(err)
			})
		} else if (config.style == 'Catalogs') {
			const i = args.id.replace(defaults.prefix + 'url_', '').split('_')[0]
			hls.getM3U(types[i].m3u, i).then(metas => {
				let meta
				metas.some(el => {
					if (el.id == args.id) {
						meta = el
						return true
					}
				})
				if (meta)
					resolve({ meta })
				else
					reject(defaults.name + ' - Could not get meta item for: ' + args.id)
			}).catch(err => {
				reject(err)
			})
		}
	})
})

const pUrl = require('url')

function parsePlaylist(url) {
	const parsed = pUrl.parse(url)
	const rootUrl = parsed.protocol + '//' + parsed.host
	return new Promise((resolve, reject) => {
		needle.get(url, (err, resp, body) => {
			if (!err && body) {
				const playlist = m3u(body)
				let streamTitle
				let streamIdx = 1
				const streams = []
				playlist.forEach(line => {
					if (isString(line)) {
						if (line.endsWith('.m3u') || line.endsWith('.m3u8')) {
							const tempStream = { title: streamTitle || ('Stream #' + streamIdx) }
							streamIdx++
							if (line.startsWith('http')) {
								tempStream.url = line
							} else if (line.startsWith('/')) {
								tempStream.url = rootUrl + line
							} else {
								const parts = url.split('/')
								parts[parts.length - 1] = line
								tempStream.url = parts.join('/')
							}
							if (tempStream.url)
								streams.push(tempStream)
						}
					} else if (isObject(line)) {
						if (line['STREAM-INF']) {
							const streamInf = line['STREAM-INF']
							if (streamInf['RESOLUTION'] && streamInf['RESOLUTION'].includes('x')) {
								const resolution = streamInf['RESOLUTION'].split('x')[1]
								if (resolution && parseInt(resolution) == resolution)
									streamTitle = resolution + 'p'
							}
						}
					}
				})

				if (!streams.length)
					streams.push({ title: 'Stream', url })

				resolve(streams)

			} else
				reject((err || {}).message || 'Unknown Error')
		})
	})
}

builder.defineStreamHandler(args => {
	return new Promise(async (resolve, reject) => {
		if (config.style == 'Channels') {
			const url = decodeURIComponent(args.id.replace(defaults.prefix + 'url_', ''))
			const streams = await hls.processStream(proxy.addProxy(url))
			resolve({ streams: streams || [] })
		} else if (config.style == 'Catalogs') {
			const url = atob(decodeURIComponent(args.id.replace(defaults.prefix + 'url_', '').split('_')[1]))
			const streams = await hls.processStream(proxy.addProxy(url))
			resolve({ streams: streams || [] })
		}
	})
})

const addonInterface = getInterface(builder)

module.exports = getRouter(addonInterface)
