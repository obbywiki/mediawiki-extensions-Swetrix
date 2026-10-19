const client = require( 'ext.swetrix.client' );
let pending;

/**
 * Evaluate boolean flags for the current anonymous visitor. Swetrix owns the five-minute result cache; concurrent callers also share the in-flight request.
 *
 * @return {Promise<Object>} Empty when disabled or unavailable
 */
function getFlags() {
	const config = mw.config.get( 'wgSwetrix' );
	if ( !config || !config.feature_flags || !client.isEnabled() ) {
		return Promise.resolve( {} );
	}

	if ( !pending ) {
		pending = client.getClient().then( ( tracker ) => {
			if ( !tracker || typeof tracker.getFeatureFlags !== 'function' ) { return {}; }
			return tracker.getFeatureFlags();
		} ).then( ( flags ) => {
			if ( !flags || typeof flags !== 'object' || Array.isArray( flags ) ) { return {}; }
			return Object.fromEntries( Object.entries( flags ).filter( ( entry ) => typeof entry[ 1 ] === 'boolean' ) );
		} ).catch( () => ( {} ) ).then( ( flags ) => {
			pending = null;
			return flags;
		} );
	}

	return pending;
}

/**
 * Read a flag without confusing an explicit false with a missing flag.
 *
 * @param {string} key Feature flag key, preferably prefixed with the extension name
 * @param {boolean} [defaultValue=false] Fallback for missing or unavailable flags
 * @return {Promise<boolean>}
 */
function isEnabled( key, defaultValue = false ) {
	return getFlags().then( ( flags ) => Object.prototype.hasOwnProperty.call( flags, key ) ? flags[ key ] : defaultValue );
}

module.exports = { getFlags, isEnabled };
