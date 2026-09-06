const config = mw.config.get( 'wgSwetrix' );
if ( !config || !config.project_id || !config.api_url || !config.script_url ) { return; }

function query_params() {
	return new URLSearchParams( window.location.search );
}

function is_redlink() {
	return query_params().get( 'redlink' ) === '1';
}

function is_404() {
	if ( config.is_404 || is_redlink() ) { return true; }

	const article_id = mw.config.get( 'wgArticleId' );
	const ns = mw.config.get( 'wgNamespaceNumber' );
	const action = mw.config.get( 'wgAction' );

	return article_id === 0 && typeof ns === 'number' && ns >= 0 && ( action === 'view' || action === 'history' );
}

function pageview_payload( payload ) {
	const page_name = mw.config.get( 'wgPageName' );
	if ( page_name ) { payload.pg = '/' + page_name; }

	const params = query_params();
	const action = params.get( 'action' );
	const meta = {};

	if ( action ) { meta.action = action; }
	if ( is_redlink() ) { meta.redlink = '1'; }

	if ( Object.keys( meta ).length ) {
		payload.meta = Object.assign( {}, payload.meta, meta );
	}

	return payload;
}

function track_404() {
	if ( !is_404() ) { return; }

	const event = { ev: '404' };
	if ( is_redlink() ) { event.meta = { redlink: '1' }; }
	
	swetrix.track( event );
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
