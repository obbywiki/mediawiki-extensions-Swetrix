let ready;

/**
 * Whether the current page permits use of the tracker.
 *
 * @return {boolean}
 */
function isEnabled() {
	const config = mw.config.get( 'wgSwetrix' );
	return !!( config && config.project_id && config.api_url && config.script_url &&
		!Number( mw.user.options.get( 'swetrix-dont-track' ) ) &&
		!( config.honor_dnt && navigator.doNotTrack === '1' ) );
}

/**
 * Load and initialize one shared tracker, including concurrent consumers.
 *
 * @return {Promise<Object|null>} Null when disabled or unavailable
 */
function getClient() {
	if ( !isEnabled() ) { return Promise.resolve( null ); }

	if ( !ready ) {
		const config = mw.config.get( 'wgSwetrix' );
		ready = Promise.resolve().then( () => mw.loader.getScript( config.script_url ) ).then( () => {
			if ( !isEnabled() ) { return null; }

			const client = window.swetrix;
			client.init( config.project_id, {
				apiURL: config.api_url,
				devMode: !!config.dev_mode
			} );

			return client;
		} ).catch( () => null );
	}

	return ready;
}

module.exports = { getClient, isEnabled };
