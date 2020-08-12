'use strict';
import { getPresenceDataUri } from '../../avatars';
import {
	ConnectRemoteProviderCommand,
	DiffWithCommand,
	InviteToLiveShareCommand,
	OpenCommitOnRemoteCommand,
	OpenFileAtRevisionCommand,
	ShowQuickCommitCommand,
	ShowQuickCommitFileCommand,
} from '../../commands';
import { DateStyle, FileAnnotationType } from '../../configuration';
import { GlyphChars } from '../../constants';
import { Container } from '../../container';
import { emojify } from '../../emojis';
import { FormatOptions, Formatter } from './formatter';
import { GitCommit, GitLogCommit, GitRemote, GitRevision, IssueOrPullRequest, PullRequest } from '../git';
import { GitUri } from '../gitUri';
import { Iterables, Promises, Strings } from '../../system';
import { ContactPresence } from '../../vsls/vsls';
import { RemoteProvider } from '../remotes/factory';

const emptyStr = '';

export interface CommitFormatOptions extends FormatOptions {
	autolinkedIssuesOrPullRequests?: Map<string, IssueOrPullRequest | Promises.CancellationError | undefined>;
	dateStyle?: DateStyle;
	footnotes?: Map<number, string>;
	getBranchAndTagTips?: (sha: string) => string | undefined;
	line?: number;
	markdown?: boolean;
	messageAutolinks?: boolean;
	messageIndent?: number;
	messageTruncateAtNewLine?: boolean;
	pullRequestOrRemote?: PullRequest | Promises.CancellationError | GitRemote;
	presence?: ContactPresence;
	previousLineDiffUris?: { current: GitUri; previous: GitUri | undefined };
	remotes?: GitRemote<RemoteProvider>[];

	tokenOptions?: {
		ago?: Strings.TokenOptions;
		agoOrDate?: Strings.TokenOptions;
		author?: Strings.TokenOptions;
		authorAgo?: Strings.TokenOptions;
		authorAgoOrDate?: Strings.TokenOptions;
		authorDate?: Strings.TokenOptions;
		changes?: Strings.TokenOptions;
		changesShort?: Strings.TokenOptions;
		committerAgo?: Strings.TokenOptions;
		committerAgoOrDate?: Strings.TokenOptions;
		committerDate?: Strings.TokenOptions;
		date?: Strings.TokenOptions;
		email?: Strings.TokenOptions;
		footnotes?: Strings.TokenOptions;
		id?: Strings.TokenOptions;
		message?: Strings.TokenOptions;
		pullRequest?: Strings.TokenOptions;
		pullRequestAgo?: Strings.TokenOptions;
		pullRequestAgoOrDate?: Strings.TokenOptions;
		pullRequestDate?: Strings.TokenOptions;
		pullRequestState?: Strings.TokenOptions;
		tips?: Strings.TokenOptions;
	};
}

export class CommitFormatter extends Formatter<GitCommit, CommitFormatOptions> {
	private get _authorDate() {
		return this._item.formatAuthorDate(this._options.dateFormat);
	}

	private get _authorDateAgo() {
		return this._item.formatAuthorDateFromNow();
	}

	private get _authorDateOrAgo() {
		const dateStyle = this._options.dateStyle != null ? this._options.dateStyle : Container.config.defaultDateStyle;
		return dateStyle === DateStyle.Absolute ? this._authorDate : this._authorDateAgo;
	}

	private get _committerDate() {
		return this._item.formatCommitterDate(this._options.dateFormat);
	}

	private get _committerDateAgo() {
		return this._item.formatCommitterDateFromNow();
	}

	private get _committerDateOrAgo() {
		const dateStyle = this._options.dateStyle != null ? this._options.dateStyle : Container.config.defaultDateStyle;
		return dateStyle === DateStyle.Absolute ? this._committerDate : this._committerDateAgo;
	}

	private get _date() {
		return this._item.formatDate(this._options.dateFormat);
	}

	private get _dateAgo() {
		return this._item.formatDateFromNow();
	}

	private get _dateOrAgo() {
		const dateStyle = this._options.dateStyle != null ? this._options.dateStyle : Container.config.defaultDateStyle;
		return dateStyle === DateStyle.Absolute ? this._date : this._dateAgo;
	}

	private get _pullRequestDate() {
		const { pullRequestOrRemote: pr } = this._options;
		if (pr == null || !PullRequest.is(pr)) return emptyStr;

		return pr.formatDate(this._options.dateFormat) ?? emptyStr;
	}

	private get _pullRequestDateAgo() {
		const { pullRequestOrRemote: pr } = this._options;
		if (pr == null || !PullRequest.is(pr)) return emptyStr;

		return pr.formatDateFromNow() ?? emptyStr;
	}

	private get _pullRequestDateOrAgo() {
		const dateStyle = this._options.dateStyle != null ? this._options.dateStyle : Container.config.defaultDateStyle;
		return dateStyle === DateStyle.Absolute ? this._pullRequestDate : this._pullRequestDateAgo;
	}

	get ago() {
		return this._padOrTruncate(this._dateAgo, this._options.tokenOptions.ago);
	}

	get agoOrDate() {
		return this._padOrTruncate(this._dateOrAgo, this._options.tokenOptions.agoOrDate);
	}

	get author() {
		const author = this._padOrTruncate(this._item.author, this._options.tokenOptions.author);
		if (!this._options.markdown) {
			return author;
		}

		return `[${author}](mailto:${this._item.email} "Email ${this._item.author} (${this._item.email})")`;
	}

	get authorAgo() {
		return this._padOrTruncate(this._authorDateAgo, this._options.tokenOptions.authorAgo);
	}

	get authorAgoOrDate() {
		return this._padOrTruncate(this._authorDateOrAgo, this._options.tokenOptions.authorAgoOrDate);
	}

	get authorDate() {
		return this._padOrTruncate(this._authorDate, this._options.tokenOptions.authorDate);
	}

	get avatar() {
		if (!this._options.markdown || !Container.config.hovers.avatars) {
			return emptyStr;
		}

		const presence = this._options.presence;
		if (presence != null) {
			const title = `${this._item.author} ${this._item.author === 'You' ? 'are' : 'is'} ${
				presence.status === 'dnd' ? 'in ' : emptyStr
			}${presence.statusText.toLocaleLowerCase()}`;

			return `${this._getAvatarMarkdown(title)}${this._getPresenceMarkdown(presence, title)}`;
		}

		return this._getAvatarMarkdown(this._item.author);
	}

	private _getAvatarMarkdown(title: string) {
		const size = Container.config.hovers.avatarSize;
		return `![${title}](${this._item
			.getAvatarUri(Container.config.defaultGravatarsStyle, size)
			.toString(true)}|width=${size},height=${size} "${title}")`;
	}

	private _getPresenceMarkdown(presence: ContactPresence, title: string) {
		return `![${title}](${getPresenceDataUri(presence.status)} "${title}")`;
	}

	get changes() {
		return this._padOrTruncate(
			GitLogCommit.is(this._item) ? this._item.getFormattedDiffStatus() : emptyStr,
			this._options.tokenOptions.changes,
		);
	}

	get changesShort() {
		return this._padOrTruncate(
			GitLogCommit.is(this._item)
				? this._item.getFormattedDiffStatus({ compact: true, separator: emptyStr })
				: emptyStr,
			this._options.tokenOptions.changesShort,
		);
	}

	get commands() {
		if (!this._options.markdown) return emptyStr;

		let commands;
		if (this._item.isUncommitted) {
			const { previousLineDiffUris: diffUris } = this._options;
			if (diffUris?.previous != null) {
				commands = `\`${this._padOrTruncate(
					GitRevision.shorten(
						GitRevision.isUncommittedStaged(diffUris.current.sha)
							? diffUris.current.sha
							: GitRevision.uncommitted,
					)!,
					this._options.tokenOptions.id,
				)}\``;

				commands += `&nbsp; **[\`${GlyphChars.MuchLessThan}\`](${DiffWithCommand.getMarkdownCommandArgs({
					lhs: {
						sha: diffUris.previous.sha ?? emptyStr,
						uri: diffUris.previous.documentUri(),
					},
					rhs: {
						sha: diffUris.current.sha ?? emptyStr,
						uri: diffUris.current.documentUri(),
					},
					repoPath: this._item.repoPath,
					line: this._options.line,
				})} "Open Changes")** `;
			} else {
				commands = `\`${this._padOrTruncate(
					GitRevision.shorten(
						this._item.isUncommittedStaged ? GitRevision.uncommittedStaged : GitRevision.uncommitted,
					)!,
					this._options.tokenOptions.id,
				)}\``;
			}

			return commands;
		}

		const separator = ' &nbsp;&nbsp;|&nbsp;&nbsp; ';

		commands = `---\n\n[$(git-commit) ${this.id}](${ShowQuickCommitCommand.getMarkdownCommandArgs(
			this._item.sha,
		)} "Show Commit")${separator}`;

		const { pullRequestOrRemote: pr } = this._options;
		if (pr != null) {
			if (PullRequest.is(pr)) {
				commands += `[$(git-pull-request) PR #${pr.number}](${pr.url} "Open Pull Request \\#${pr.number} on ${
					pr.provider
				}\n${GlyphChars.Dash.repeat(2)}\n${pr.title}\n${pr.state}, ${pr.formatDateFromNow()}")${separator}`;
			} else if (pr instanceof Promises.CancellationError) {
				commands += `[$(git-pull-request) PR (${GlyphChars.Ellipsis})](# "Searching for a Pull Request (if any) that introduced this commit...")${separator}`;
			} else if (pr.provider != null) {
				commands += `[$(plug) Connect to ${pr.provider.name}${
					GlyphChars.Ellipsis
				}](${ConnectRemoteProviderCommand.getMarkdownCommandArgs(pr)} "Connect to ${
					pr.provider.name
				} to enable the display of the Pull Request (if any) that introduced this commit")${separator}`;
			}
		}

		commands += `[$(compare-changes)](${DiffWithCommand.getMarkdownCommandArgs(
			this._item,
			this._options.line,
		)} "Open Changes")${separator}`;

		if (this._item.previousSha != null) {
			const uri = GitUri.toRevisionUri(
				this._item.previousSha,
				this._item.previousUri.fsPath,
				this._item.repoPath,
			);
			commands += `[$(history)](${OpenFileAtRevisionCommand.getMarkdownCommandArgs(
				uri,
				FileAnnotationType.Blame,
				this._options.line,
			)} "Blame Previous Revision")${separator}`;
		}

		if (this._options.remotes != null && this._options.remotes.length !== 0) {
			const providers = GitRemote.getHighlanderProviders(this._options.remotes);

			commands += `[$(link-external)](${OpenCommitOnRemoteCommand.getMarkdownCommandArgs(
				this._item.sha,
			)} "Open Commit on ${providers?.length ? providers[0].name : 'Remote'}")${separator}`;
		}

		if (this._item.author !== 'You') {
			const presence = this._options.presence;
			if (presence != null) {
				commands += `[$(live-share)](${InviteToLiveShareCommand.getMarkdownCommandArgs(
					this._item.email,
				)} "Invite ${this._item.author} (${presence.statusText}) to a Live Share Session")${separator}`;
			}
		}

		commands += `[$(ellipsis)](${ShowQuickCommitFileCommand.getMarkdownCommandArgs({
			revisionUri: GitUri.toRevisionUri(this._item.toGitUri()).toString(true),
		})} "Show More Actions")`;

		return commands;
	}

	get committerAgo() {
		return this._padOrTruncate(this._committerDateAgo, this._options.tokenOptions.committerAgo);
	}

	get committerAgoOrDate() {
		return this._padOrTruncate(this._committerDateOrAgo, this._options.tokenOptions.committerAgoOrDate);
	}

	get committerDate() {
		return this._padOrTruncate(this._committerDate, this._options.tokenOptions.committerDate);
	}

	get date() {
		return this._padOrTruncate(this._date, this._options.tokenOptions.date);
	}

	get email() {
		return this._padOrTruncate(this._item.email ?? emptyStr, this._options.tokenOptions.email);
	}

	get footnotes() {
		if (this._options.footnotes == null || this._options.footnotes.size === 0) return '';

		return this._padOrTruncate(
			Iterables.join(
				Iterables.map(this._options.footnotes, ([i, footnote]) => `${Strings.getSuperscript(i)} ${footnote}`),
				'\n',
			),
			this._options.tokenOptions.footnotes,
		);
	}

	get id() {
		return this._padOrTruncate(this._item.shortSha ?? emptyStr, this._options.tokenOptions.id);
	}

	get message() {
		if (this._item.isUncommitted) {
			const staged =
				this._item.isUncommittedStaged ||
				(this._options.previousLineDiffUris?.current?.isUncommittedStaged ?? false);

			return this._padOrTruncate(
				`${this._options.markdown ? '\n> ' : ''}${staged ? 'Staged' : 'Uncommitted'} changes`,
				this._options.tokenOptions.message,
			);
		}

		let message = this._item.message;
		if (this._options.messageTruncateAtNewLine) {
			const index = message.indexOf('\n');
			if (index !== -1) {
				message = `${message.substring(0, index)}${GlyphChars.Space}${GlyphChars.Ellipsis}`;
			}
		}

		message = emojify(message);
		message = this._padOrTruncate(message, this._options.tokenOptions.message);

		if (this._options.messageAutolinks) {
			message = Container.autolinks.linkify(
				this._options.markdown ? Strings.escapeMarkdown(message, { quoted: true }) : message,
				this._options.markdown ?? false,
				this._options.remotes,
				this._options.autolinkedIssuesOrPullRequests,
				this._options.footnotes,
			);
		}

		if (this._options.messageIndent != null && !this._options.markdown) {
			message = message.replace(/^/gm, GlyphChars.Space.repeat(this._options.messageIndent));
		}

		return this._options.markdown ? `\n> ${message}` : message;
	}

	get pullRequest() {
		const { pullRequestOrRemote: pr } = this._options;
		if (pr == null) return emptyStr;

		let text;
		if (PullRequest.is(pr)) {
			if (this._options.markdown) {
				text = `[PR #${pr.number}](${pr.url} "Open Pull Request \\#${pr.number} on ${
					pr.provider
				}\n${GlyphChars.Dash.repeat(2)}\n${pr.title}\n${pr.state}, ${pr.formatDateFromNow()}")`;
			} else if (this._options.footnotes != null) {
				const index = this._options.footnotes.size + 1;
				this._options.footnotes.set(
					index,
					`PR #${pr.number}: ${pr.title}  ${GlyphChars.Dot}  ${pr.state}, ${pr.formatDateFromNow()}`,
				);

				text = `PR #${pr.number}${Strings.getSuperscript(index)}`;
			} else {
				text = `PR #${pr.number}`;
			}
		} else if (pr instanceof Promises.CancellationError) {
			text = this._options.markdown
				? `[PR ${GlyphChars.Ellipsis}](# "Searching for a Pull Request (if any) that introduced this commit...")`
				: `PR ${GlyphChars.Ellipsis}`;
		} else {
			return emptyStr;
		}

		return this._padOrTruncate(text, this._options.tokenOptions.pullRequest);
	}

	get pullRequestAgo() {
		return this._padOrTruncate(this._pullRequestDateAgo, this._options.tokenOptions.pullRequestAgo);
	}

	get pullRequestAgoOrDate() {
		return this._padOrTruncate(this._pullRequestDateOrAgo, this._options.tokenOptions.pullRequestAgoOrDate);
	}

	get pullRequestDate() {
		return this._padOrTruncate(this._pullRequestDate, this._options.tokenOptions.pullRequestDate);
	}

	get pullRequestState() {
		const { pullRequestOrRemote: pr } = this._options;
		if (pr == null || !PullRequest.is(pr)) return emptyStr;

		return this._padOrTruncate(pr.state ?? emptyStr, this._options.tokenOptions.pullRequestState);
	}

	get sha() {
		return this.id;
	}

	get tips() {
		const branchAndTagTips = this._options.getBranchAndTagTips?.(this._item.sha);
		if (branchAndTagTips == null) return emptyStr;

		return this._padOrTruncate(branchAndTagTips, this._options.tokenOptions.tips);
	}

	static fromTemplate(template: string, commit: GitCommit, dateFormat: string | null): string;
	static fromTemplate(template: string, commit: GitCommit, options?: CommitFormatOptions): string;
	static fromTemplate(
		template: string,
		commit: GitCommit,
		dateFormatOrOptions?: string | null | CommitFormatOptions,
	): string;
	static fromTemplate(
		template: string,
		commit: GitCommit,
		dateFormatOrOptions?: string | null | CommitFormatOptions,
	): string {
		if (CommitFormatter.has(template, 'footnotes')) {
			if (dateFormatOrOptions == null || typeof dateFormatOrOptions === 'string') {
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				dateFormatOrOptions = {
					dateFormat: dateFormatOrOptions,
				} as CommitFormatOptions;
			}

			if (dateFormatOrOptions.footnotes == null) {
				dateFormatOrOptions.footnotes = new Map<number, string>();
			}
		}

		return super.fromTemplateCore(this, template, commit, dateFormatOrOptions);
	}

	static has(template: string, ...tokens: (keyof NonNullable<CommitFormatOptions['tokenOptions']>)[]): boolean {
		return super.has<CommitFormatOptions>(template, ...tokens);
	}
}
