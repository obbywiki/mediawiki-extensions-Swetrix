const config = mw.config.get( 'wgSwetrix' );
if ( !config || !config.project_id || !config.api_url || !config.script_url ) { return; }

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
	return !!( target && target.constructor && target.constructor.static &&
		target.constructor.static.name === 'article' );
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
} );
