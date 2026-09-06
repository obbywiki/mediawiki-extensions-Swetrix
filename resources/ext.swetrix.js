const config = mw.config.get( 'wgSwetrix' );
if ( !config || !config.project_id || !config.api_url || !config.script_url ) { return; }

if ( Number( mw.user.options.get( 'swetrix-dont-track' ) ) ) { return; }
if ( config.honor_dnt && navigator.doNotTrack === '1' ) { return; }

const query_params = new URLSearchParams( window.location.search );

const is_redlink = query_params.get( 'redlink' ) === '1';

function current_action() {
	const action = mw.config.get( 'wgAction' ) || query_params.get( 'action' ) || 'view';
	if ( action === 'submit' ) { return 'edit.submit'; }

	return action;
}

function is_404() {
	if ( config.is_404 || is_redlink ) { return true; }

	const article_id = mw.config.get( 'wgArticleId' );
	const ns = mw.config.get( 'wgNamespaceNumber' );
	const action = mw.config.get( 'wgAction' );

	return article_id === 0 && typeof ns === 'number' && ns >= 0 && ( action === 'view' || action === 'history' );
}

function event_meta( extra ) {
	const meta = Object.assign( { action: current_action() }, extra );
	if ( is_redlink ) { meta.redlink = '1'; }

	return meta;
}

function pageview_payload( payload ) {
	const page_name = mw.config.get( 'wgPageName' );
	if ( page_name ) { payload.pg = '/' + page_name; }

	payload.meta = Object.assign( {}, payload.meta, event_meta() );
	return payload;
}

function track_404() {
	if ( !is_404() ) { return; }

	swetrix.track( {
		ev: '404',
		meta: event_meta()
	} );
}

function track_action() {
	swetrix.track( {
		ev: 'action.' + current_action(),
		meta: event_meta()
	} );
}

function track_edit_event( name, extra ) {
	swetrix.track( {
		ev: 'action.edit.' + name,
		meta: event_meta( extra )
	} );
}

const php_edit_events = config.edit_events || [];
const php_has_save = php_edit_events.includes( 'save' );
let ve_new_target_seen = false;
let ve_article_session = false;
let last_ve_start_at = 0;
let last_ve_save_at = 0;

function is_article_ve_target( target ) {
	return !!( target && target.constructor && target.constructor.static && target.constructor.static.name === 'article' );
}

function track_ve_start() {
	const now = Date.now();
	if ( now - last_ve_start_at < 1500 ) { return; }

	last_ve_start_at = now;
	ve_article_session = true;
	track_edit_event( 'start', { editor: 'visualeditor' } );
}

function bind_ve_target( target ) {
	ve_new_target_seen = true;
	if ( !is_article_ve_target( target ) ) { return; }

	ve_article_session = true;
	target.on( 'surfaceReady', track_ve_start );
	if ( typeof target.getSurface === 'function' && target.getSurface() ) {
		track_ve_start();
	}
}

function on_ve_activation_complete() {
	if ( ve_new_target_seen && !ve_article_session ) { return; }
	track_ve_start();
}

function track_php_edit_events() {
	php_edit_events.forEach( ( name ) => {
		track_edit_event( name, { editor: 'wikitext' } );
	} );
}

function on_post_edit() {
	if ( php_has_save ) { return; }
	if ( !ve_article_session && !query_params.get( 'venotify' ) ) { return; }

	const now = Date.now();
	if ( now - last_ve_save_at < 1500 ) { return; }

	last_ve_save_at = now;
	track_edit_event( 'save', { editor: 'visualeditor' } );
}

function bind_visual_editor() {
	mw.hook( 've.newTarget' ).add( bind_ve_target );
	mw.hook( 've.activationComplete' ).add( on_ve_activation_complete );
	mw.hook( 'postEdit' ).add( on_post_edit );
	mw.hook( 'postEditMobile' ).add( on_post_edit );
}

function parse_href( href ) {
	if ( !href ) { return null; }

	try {
		return new URL( href, window.location.href );
	} catch ( e ) {
		return null;
	}
}

function add_host( hosts, host ) {
	if ( !host ) { return; }

	hosts[ host.toLowerCase() ] = true;
}

function wiki_hosts() {
	const hosts = {};
	add_host( hosts, window.location.hostname );

	[ 'wgServer', 'wgCanonicalServer' ].forEach( ( key ) => {
		const url = parse_href( mw.config.get( key ) );
		if ( url ) { add_host( hosts, url.hostname ); }
	} );

	return hosts;
}

const internal_hosts = wiki_hosts();
const network_domains = ( config.network_domains || [] ).map( ( domain ) => String( domain ).toLowerCase() ).filter( Boolean );
const track_outbound_clicks = !!config.track_outbound_clicks;
const track_network_clicks = !!config.track_network_clicks;

function is_internal_host( host ) {
	host = host.toLowerCase();

	if ( internal_hosts[ host ] ) { return true; }
	if ( host.startsWith( 'www.' ) && internal_hosts[ host.slice( 4 ) ] ) { return true; }
	if ( internal_hosts[ 'www.' + host ] ) { return true; }

	return false;
}

function is_network_host( host ) {
	host = host.toLowerCase();

	return network_domains.some( ( domain ) => host === domain || host.endsWith( '.' + domain ) );
}

function link_click_event_name( url ) {
	if ( url.protocol !== 'http:' && url.protocol !== 'https:' ) { return null; }
	if ( is_internal_host( url.hostname ) ) { return null; }
	if ( is_network_host( url.hostname ) ) { return track_network_clicks ? 'link.network.click' : null; }

	return track_outbound_clicks ? 'link.outbound.click' : null;
}

function on_link_click( event ) {
	if ( event.type === 'click' && event.button !== 0 ) { return; }
	if ( event.type === 'auxclick' && event.button !== 1 ) { return; }

	const target = event.target instanceof Element ? event.target : event.target && event.target.parentElement;
	if ( !target ) { return; }

	const link = target.closest( 'a[href]' );
	if ( !link ) { return; }

	const url = parse_href( link.href );
	if ( !url ) { return; }

	const name = link_click_event_name( url );
	if ( !name ) { return; }

	swetrix.track( {
		ev: name,
		meta: event_meta( {
			host: url.hostname,
			path: url.pathname
		} )
	} );
}

function bind_link_clicks() {
	if ( !track_outbound_clicks && !( track_network_clicks && network_domains.length ) ) { return; }
	document.addEventListener( 'click', on_link_click, true );
	document.addEventListener( 'auxclick', on_link_click, true );
}

mw.loader.getScript( config.script_url ).then( () => {
	swetrix.init( config.project_id, {
		apiURL: config.api_url,
		devMode: !!config.dev_mode
	} );

	swetrix.trackViews( {
		callback: pageview_payload
	} );

	track_action();
	track_php_edit_events();
	track_404();
	bind_visual_editor();
	bind_link_clicks();
} );
