<?php

namespace MediaWiki\Extension\Swetrix;

use MediaWiki\Config\Config;
use MediaWiki\Output\Hook\BeforePageDisplayHook;
use MediaWiki\Output\OutputPage;

class Hooks implements BeforePageDisplayHook {

	public function __construct(
		private readonly Config $config
	) {
	}

	/** @inheritDoc */
	public function onBeforePageDisplay( $out, $skin ): void {
		$project_id = (string)$this->config->get( 'SwetrixProjectId' );
		$api_url = (string)$this->config->get( 'SwetrixApiUrl' );
		$script_url = (string)$this->config->get( 'SwetrixScriptUrl' );
		$dev_mode = (bool)$this->config->get( 'SwetrixDevMode' );

		if ( $project_id === '' || $api_url === '' ) {
			return;
		}

		// if ( $out->getUser()->getOption( 'swetrix-dont-track' ) ) {
		// 	return;
		// }

		$this->allowCspHosts( $out, $script_url, $api_url );

		$out->addJsConfigVars( 'wgSwetrix', [
			'project_id' => $project_id,
			'api_url' => $api_url,
			'script_url' => $script_url,
			'dev_mode' => $dev_mode,
			'is_404' => $this->is_not_found( $out )
		] );
		$out->addModules( [ 'ext.swetrix' ] );
	}

	private function is_missing_article( OutputPage $out ): bool {
		$title = $out->getTitle();
		return $title !== null && !$title->isSpecialPage() && !$title->exists();
	}

	private function is_not_found( OutputPage $out ): bool {
		if ( http_response_code() === 404 ) {
			return true;
		}

		if ( !$this->is_missing_article( $out ) ) {
			return false;
		}

		if ( $out->getRequest()->getBool( 'redlink' ) ) {
			return true;
		}

		$action = $out->getActionName();
		return $action === 'view' || $action === 'history';
	}

	private function allowCspHosts( OutputPage $out, string $script_url, string $api_url ): void {
		if ( !method_exists( $out, 'getCSP' ) ) {
			return;
		}

		$csp = $out->getCSP();
		if ( !$csp ) {
			return;
		}

		$script_origin = $this->originFromUrl( $script_url );
		if ( $script_origin !== null && method_exists( $csp, 'addScriptSrc' ) ) {
			$csp->addScriptSrc( $script_origin );
		}

		$api_origin = $this->originFromUrl( $api_url );
		if ( $api_origin === null ) {
			return;
		}

		if ( method_exists( $csp, 'addConnectSrc' ) ) {
			$csp->addConnectSrc( $api_origin );
		} elseif ( method_exists( $csp, 'addDefaultSrc' ) ) {
			$csp->addDefaultSrc( $api_origin );
		}
	}

	private function originFromUrl( string $url ): ?string {
		$parts = parse_url( $url );
		if ( $parts === false || !isset( $parts['host'] ) ) {
			return null;
		}

		$scheme = $parts['scheme'] ?? 'https';
		$origin = $scheme . '://' . $parts['host'];
		if ( isset( $parts['port'] ) ) {
			$origin .= ':' . $parts['port'];
		}

		return $origin;
	}
}
