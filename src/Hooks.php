<?php

namespace MediaWiki\Extension\Swetrix;

use MediaWiki\Config\Config;
use MediaWiki\Context\RequestContext;
use MediaWiki\Hook\EditPageBeforeConflictDiffHook;
use MediaWiki\Hook\EditPage__showEditForm_initialHook;
use MediaWiki\Output\Hook\BeforePageDisplayHook;
use MediaWiki\Output\OutputPage;
use MediaWiki\Storage\Hook\PageSaveCompleteHook;

class Hooks implements BeforePageDisplayHook, EditPage__showEditForm_initialHook, EditPageBeforeConflictDiffHook, PageSaveCompleteHook {

	private const SESSION_EDIT_SAVE = 'swetrix-edit-save';

	/** @var string[] */
	private array $edit_events = [];

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
			'is_404' => $this->is_not_found( $out ),
			'edit_events' => $this->edit_events_for_page( $out )
		] );
		$out->addModules( [ 'ext.swetrix' ] );
	}

	/**
	 * @inheritDoc
	 * @see https://www.mediawiki.org/wiki/Manual:Hooks/EditPage::showEditForm:initial
	 */
	public function onEditPage__showEditForm_initial( $editor, $out ): void {
		if ( !$this->tracking_enabled() ) {
			return;
		}

		if ( $editor->isConflict ) {
			return;
		}

		if ( ( $editor->formtype ?? '' ) !== 'initial' ) {
			return;
		}

		$this->edit_events[] = 'start';
	}

	/**
	 * @inheritDoc
	 * @see https://www.mediawiki.org/wiki/Manual:Hooks/EditPageBeforeConflictDiff
	 */
	public function onEditPageBeforeConflictDiff( $editor, $out ): void {
		if ( !$this->tracking_enabled() ) {
			return;
		}

		$this->edit_events[] = 'conflict';
	}

	/**
	 * @inheritDoc
	 * @see https://www.mediawiki.org/wiki/Manual:Hooks/PageSaveComplete
	 */
	public function onPageSaveComplete( $wiki_page, $user, $summary, $flags, $revision_record, $edit_result ): void {
		if ( !$this->tracking_enabled() ) {
			return;
		}

		if ( $edit_result->isNullEdit() ) {
			return;
		}

		if ( defined( 'MW_ENTRY_POINT' ) && MW_ENTRY_POINT !== 'index' ) {
			return;
		}

		$session = RequestContext::getMain()->getRequest()->getSession();
		$session->set( self::SESSION_EDIT_SAVE, 1 );
		$session->persist();
	}

	private function tracking_enabled(): bool {
		return (string)$this->config->get( 'SwetrixProjectId' ) !== '' && (string)$this->config->get( 'SwetrixApiUrl' ) !== '';
	}

	/** @return string[] */
	private function edit_events_for_page( OutputPage $out ): array {
		$edit_events = $this->edit_events;

		if ( $out->getRedirect() !== '' ) {
			return array_values( array_unique( $edit_events ) );
		}

		$session = $out->getRequest()->getSession();
		if ( $session->get( self::SESSION_EDIT_SAVE ) ) {
			$session->remove( self::SESSION_EDIT_SAVE );
			$edit_events[] = 'save';
		}

		return array_values( array_unique( $edit_events ) );
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
