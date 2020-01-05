'use strict';
import { env, Uri } from 'vscode';
import {
	Command,
	command,
	CommandContext,
	Commands,
	isCommandViewContextWithCommit,
	isCommandViewContextWithFileCommit,
} from './common';
import { Container } from '../container';

export interface OpenPullRequestOnRemoteCommandArgs {
	ref?: string;
	repoPath?: string;
}

@command()
export class OpenPullRequestOnRemoteCommand extends Command {
	constructor() {
		super(Commands.OpenPullRequestOnRemote);
	}

	protected preExecute(context: CommandContext, args?: OpenPullRequestOnRemoteCommandArgs) {
		if (isCommandViewContextWithCommit(context) || isCommandViewContextWithFileCommit(context)) {
			args = { ...args, ref: context.node.commit.sha, repoPath: context.node.commit.repoPath };
		}

		return this.execute(args);
	}
	async execute(args?: OpenPullRequestOnRemoteCommandArgs) {
		if (args?.repoPath == null || args?.ref == null) {
			return;
		}

		const remote = await Container.git.getRemoteWithApiProvider(args.repoPath);
		if (remote?.provider == null) return;

		const pr = await Container.git.getPullRequestForCommit(args.ref, remote.provider);
		if (pr == null) return;

		void env.openExternal(Uri.parse(pr.url));
	}
}
