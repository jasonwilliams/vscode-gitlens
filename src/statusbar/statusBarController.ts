'use strict';
import { ConfigurationChangeEvent, Disposable, StatusBarAlignment, StatusBarItem, TextEditor, window } from 'vscode';
import { Commands } from '../commands';
import { configuration, StatusBarCommand } from '../configuration';
import { isTextEditor } from '../constants';
import { Container } from '../container';
import { CommitFormatter, GitCommit } from '../git/git';
import { LinesChangeEvent } from '../trackers/gitLineTracker';
import { debug } from '../system';

export class StatusBarController implements Disposable {
	private _blameStatusBarItem: StatusBarItem | undefined;
	private readonly _disposable: Disposable;
	private _modeStatusBarItem: StatusBarItem | undefined;

	constructor() {
		this._disposable = Disposable.from(configuration.onDidChange(this.onConfigurationChanged, this));
		this.onConfigurationChanged(configuration.initializingChangeEvent);
	}

	dispose() {
		this.clearBlame();

		this._blameStatusBarItem?.dispose();
		this._modeStatusBarItem?.dispose();

		Container.lineTracker.stop(this);
		this._disposable.dispose();
	}

	private onConfigurationChanged(e: ConfigurationChangeEvent) {
		if (configuration.changed(e, 'mode')) {
			const mode =
				Container.config.mode.active && Container.config.mode.statusBar.enabled
					? Container.config.modes[Container.config.mode.active]
					: undefined;
			if (mode?.statusBarItemName) {
				const alignment =
					Container.config.mode.statusBar.alignment !== 'left'
						? StatusBarAlignment.Right
						: StatusBarAlignment.Left;

				if (configuration.changed(e, 'mode', 'statusBar', 'alignment')) {
					if (this._modeStatusBarItem?.alignment !== alignment) {
						this._modeStatusBarItem?.dispose();
						this._modeStatusBarItem = undefined;
					}
				}

				this._modeStatusBarItem =
					this._modeStatusBarItem ??
					window.createStatusBarItem(alignment, alignment === StatusBarAlignment.Right ? 999 : 1);
				this._modeStatusBarItem.command = Commands.SwitchMode;
				this._modeStatusBarItem.text = mode.statusBarItemName;
				this._modeStatusBarItem.tooltip = 'Switch GitLens Mode';
				this._modeStatusBarItem.show();
			} else if (this._modeStatusBarItem !== undefined) {
				this._modeStatusBarItem.dispose();
				this._modeStatusBarItem = undefined;
			}
		}

		if (!configuration.changed(e, 'statusBar')) return;

		if (Container.config.statusBar.enabled) {
			const alignment =
				Container.config.statusBar.alignment !== 'left' ? StatusBarAlignment.Right : StatusBarAlignment.Left;

			if (configuration.changed(e, 'statusBar', 'alignment')) {
				if (this._blameStatusBarItem !== undefined && this._blameStatusBarItem.alignment !== alignment) {
					this._blameStatusBarItem.dispose();
					this._blameStatusBarItem = undefined;
				}
			}

			this._blameStatusBarItem =
				this._blameStatusBarItem ??
				window.createStatusBarItem(alignment, alignment === StatusBarAlignment.Right ? 1000 : 0);
			this._blameStatusBarItem.command = Container.config.statusBar.command;

			if (configuration.changed(e, 'statusBar', 'enabled')) {
				Container.lineTracker.start(
					this,
					Container.lineTracker.onDidChangeActiveLines(this.onActiveLinesChanged, this),
				);
			}
		} else if (configuration.changed(e, 'statusBar', 'enabled')) {
			Container.lineTracker.stop(this);

			if (this._blameStatusBarItem !== undefined) {
				this._blameStatusBarItem.dispose();
				this._blameStatusBarItem = undefined;
			}
		}
	}

	@debug({
		args: {
			0: (e: LinesChangeEvent) =>
				`editor=${e.editor?.document.uri.toString(true)}, lines=${e.lines?.join(',')}, pending=${Boolean(
					e.pending,
				)}, reason=${e.reason}`,
		},
	})
	private onActiveLinesChanged(e: LinesChangeEvent) {
		// If we need to reduceFlicker, don't clear if only the selected lines changed
		let clear = !(
			Container.config.statusBar.reduceFlicker &&
			e.reason === 'selection' &&
			(e.pending || e.lines !== undefined)
		);
		if (!e.pending && e.lines !== undefined) {
			const state = Container.lineTracker.getState(e.lines[0]);
			if (state?.commit !== undefined) {
				this.updateBlame(state.commit, e.editor!);

				return;
			}

			clear = true;
		}

		if (clear) {
			this.clearBlame();
		}
	}

	clearBlame() {
		if (this._blameStatusBarItem !== undefined) {
			this._blameStatusBarItem.hide();
		}
	}

	private updateBlame(commit: GitCommit, editor: TextEditor) {
		const cfg = Container.config.statusBar;
		if (!cfg.enabled || this._blameStatusBarItem === undefined || !isTextEditor(editor)) return;

		this._blameStatusBarItem.text = `$(git-commit) ${CommitFormatter.fromTemplate(cfg.format, commit, {
			messageTruncateAtNewLine: true,
			dateFormat: cfg.dateFormat === null ? Container.config.defaultDateFormat : cfg.dateFormat
		})}`;

		switch (cfg.command) {
			case StatusBarCommand.ToggleFileBlame:
				this._blameStatusBarItem.tooltip = 'Toggle File Blame Annotations';
				break;
			case StatusBarCommand.DiffWithPrevious:
				this._blameStatusBarItem.command = Commands.DiffLineWithPrevious;
				this._blameStatusBarItem.tooltip = 'Open Line Changes with Previous Revision';
				break;
			case StatusBarCommand.DiffWithWorking:
				this._blameStatusBarItem.command = Commands.DiffLineWithWorking;
				this._blameStatusBarItem.tooltip = 'Open Line Changes with Working File';
				break;
			case StatusBarCommand.ToggleCodeLens:
				this._blameStatusBarItem.tooltip = 'Toggle Git CodeLens';
				break;
			case StatusBarCommand.RevealCommitInView:
				this._blameStatusBarItem.tooltip = 'Reveal Commit in Repositories View';
				break;
			case StatusBarCommand.ShowCommitsInView:
				this._blameStatusBarItem.tooltip = 'Show Commit in Repositories View';
				break;
			case StatusBarCommand.ShowQuickCommitDetails:
				this._blameStatusBarItem.tooltip = 'Show Commit';
				break;
			case StatusBarCommand.ShowQuickCommitFileDetails:
				this._blameStatusBarItem.tooltip = 'Show Commit';
				break;
			case StatusBarCommand.ShowQuickFileHistory:
				this._blameStatusBarItem.tooltip = 'Show File History';
				break;
			case StatusBarCommand.ShowQuickCurrentBranchHistory:
				this._blameStatusBarItem.tooltip = 'Show Branch History';
				break;
		}

		this._blameStatusBarItem.show();
	}
}
