( function () {
	var config = mw.config.get( 'wgSwetrix' );
	if ( !config || !config.project_id || !config.api_url || !config.script_url ) { return; }

	function pageview_payload( payload ) {
		var page_name = mw.config.get( 'wgPageName' );
		if ( page_name ) { payload.pg = '/' + page_name; }

		var action = new URLSearchParams( window.location.search ).get( 'action' );
		if ( action ) {
			payload.meta = Object.assign( {}, payload.meta, {
				action: action
			} );
		}

		return payload;
	}

	mw.loader.getScript( config.script_url ).then( function () {
		swetrix.init( config.project_id, {
			apiURL: config.api_url,
			devMode: !!config.dev_mode
		} );
		
		swetrix.trackViews( {
			callback: pageview_payload
		} );
	} );
}() );
