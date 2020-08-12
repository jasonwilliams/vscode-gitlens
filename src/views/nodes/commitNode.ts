'use strict';
import * as paths from 'path';
import { Command, ThemeIcon, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { Commands, DiffWithPreviousCommandArgs } from '../../commands';
import { CommitFileNode } from './commitFileNode';
import { ViewFilesLayout } from '../../configuration';
import { GlyphChars } from '../../constants';
import { Container } from '../../container';
import { FileNode, FolderNode } from './folderNode';
import {
	CommitFormatter,
	GitBranch,
	GitLogCommit,
	GitRemote,
	IssueOrPullRequest,
	PullRequest,
	RemoteProvider,
} from '../../git/git';
import { Arrays, Iterables, Promises, Strings } from '../../system';
import { ViewWithFiles } from '../viewBase';
import { ResourceType, ViewNode, ViewRefNode } from './viewNode';

export class CommitNode extends ViewRefNode<ViewWithFiles> {
	constructor(
		view: ViewWithFiles,
		parent: ViewNode,
		public readonly commit: GitLogCommit,
		public readonly branch?: GitBranch,
		private readonly getBranchAndTagTips?: (sha: string) => string | undefined,
		private readonly _options: { expand?: boolean } = {},
	) {
		super(commit.toGitUri(), view, parent);
	}

	toClipboard(): string {
		return this.commit.sha;
	}

	get ref(): string {
		return this.commit.sha;
	}

	private get tooltip() {
		return CommitFormatter.fromTemplate(
			this.commit.isUncommitted
				? `\${author} ${GlyphChars.Dash} \${id}\n\${ago} (\${date})`
				: `\${author}\${ (email)}\${" via "pullRequest} ${
						GlyphChars.Dash
				  } \${id}\${ (tips)}\n\${ago} (\${date})\${\n\nmessage}${this.commit.getFormattedDiffStatus({
						expand: true,
						prefix: '\n\n',
						separator: '\n',
				  })}\${\n\n${GlyphChars.Dash.repeat(2)}\nfootnotes}`,
			this.commit,
			{
				autolinkedIssuesOrPullRequests: this._details?.autolinkedIssuesOrPullRequests,
				dateFormat: Container.config.defaultDateFormat,
				getBranchAndTagTips: this.getBranchAndTagTips,
				messageAutolinks: true,
				messageIndent: 4,
				pullRequestOrRemote: this._details?.pr,
				remotes: this._details?.remotes,
			},
		);
	}

	getChildren(): ViewNode[] {
		const commit = this.commit;
		let children: FileNode[] = [
			...Iterables.map(commit.files, s => new CommitFileNode(this.view, this, s, commit.toFileCommit(s)!)),
		];

		if (this.view.config.files.layout !== ViewFilesLayout.List) {
			const hierarchy = Arrays.makeHierarchical(
				children,
				n => n.uri.relativePath.split('/'),
				(...parts: string[]) => Strings.normalizePath(paths.join(...parts)),
				this.view.config.files.compact,
			);

			const root = new FolderNode(this.view, this, this.repoPath, '', hierarchy);
			children = root.getChildren() as FileNode[];
		} else {
			children.sort((a, b) =>
				a.label!.localeCompare(b.label!, undefined, { numeric: true, sensitivity: 'base' }),
			);
		}
		return children;
	}

	getTreeItem(): TreeItem {
		const label = CommitFormatter.fromTemplate(this.view.config.commitFormat, this.commit, {
			dateFormat: Container.config.defaultDateFormat,
			getBranchAndTagTips: this.getBranchAndTagTips,
			messageTruncateAtNewLine: true,
		});

		const item = new TreeItem(
			label,
			this._options.expand ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed,
		);

		item.contextValue = `${ResourceType.Commit}${this.branch?.current ? '+current' : ''}${
			this._details == null
				? '+details'
				: `${this._details?.autolinkedIssuesOrPullRequests != null ? '+autolinks' : ''}${
						this._details?.pr != null ? '+pr' : ''
				  }`
		}`;

		item.description = CommitFormatter.fromTemplate(this.view.config.commitDescriptionFormat, this.commit, {
			messageTruncateAtNewLine: true,
			dateFormat: Container.config.defaultDateFormat,
		});
		item.iconPath = this.view.config.avatars
			? this.commit.getAvatarUri(Container.config.defaultGravatarsStyle)
			: new ThemeIcon('git-commit');
		item.tooltip = this.tooltip;

		return item;
	}

	getCommand(): Command | undefined {
		const commandArgs: DiffWithPreviousCommandArgs = {
			commit: this.commit,
			uri: this.uri,
			line: 0,
			showOptions: {
				preserveFocus: true,
				preview: true,
			},
		};
		return {
			title: 'Open Changes with Previous Revision',
			command: Commands.DiffWithPrevious,
			arguments: [undefined, commandArgs],
		};
	}

	private _details:
		| {
				autolinkedIssuesOrPullRequests:
					| Map<string, IssueOrPullRequest | Promises.CancellationError | undefined>
					| undefined;
				pr: PullRequest | undefined;
				remotes: GitRemote<RemoteProvider>[];
		  }
		| undefined = undefined;

	async loadDetails() {
		if (this._details != null) return;

		const remotes = await Container.git.getRemotes(this.commit.repoPath);
		const remote = await Container.git.getRemoteWithApiProvider(remotes);
		if (remote?.provider == null) return;

		const [autolinkedIssuesOrPullRequests, pr] = await Promise.all([
			Container.autolinks.getIssueOrPullRequestLinks(this.commit.message, remote),
			Container.git.getPullRequestForCommit(this.commit.ref, remote.provider),
		]);

		this._details = {
			autolinkedIssuesOrPullRequests: autolinkedIssuesOrPullRequests,
			pr: pr,
			remotes: remotes,
		};

		// TODO@eamodio
		// Add autolinks action to open a quickpick to pick the autolink
		// Add pr action to open the pr

		void this.triggerChange();
	}
}
