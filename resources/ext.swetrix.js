const config = mw.config.get( 'wgSwetrix' );

if ( !config || !config.project_id || !config.api_url || !config.script_url ) { return; }

const query_params = new URLSearchParams( window.location.search );
const is_redlink = query_params.get( 'redlink' ) === '1';

function current_action() {
	const action = mw.config.get( 'wgAction' ) || query_params().get( 'action' ) || 'view';
	if ( action === 'submit' ) { return 'edit.submit'; }

	return action;
}

function is_404() {
	if ( config.is_404 || is_redlink() ) { return true; }

	const article_id = mw.config.get( 'wgArticleId' );
	const ns = mw.config.get( 'wgNamespaceNumber' );
	const action = mw.config.get( 'wgAction' );

	return article_id === 0 && typeof ns === 'number' && ns >= 0 && ( action === 'view' || action === 'history' );
}

function event_meta() {
	const meta = { action: current_action() };
	if ( is_redlink() ) { meta.redlink = '1'; }

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

mw.loader.getScript( config.script_url ).then( () => {
	swetrix.init( config.project_id, {
		apiURL: config.api_url,
		devMode: !!config.dev_mode
	} );

	swetrix.trackViews( {
		callback: pageview_payload
	} );

	track_404();
} );
