'use strict';
import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { SearchCommitsCommandArgs } from '../../commands';
import { GlyphChars } from '../../constants';
import { debug, gate, Iterables, log, Promises } from '../../system';
import { View } from '../viewBase';
import { CommandMessageNode, MessageNode } from './common';
import { ResourceType, unknownGitUri, ViewNode } from './viewNode';
import { GitBranch, SearchOperators } from '../../git/git';
import { GitUri } from '../../git/gitUri';
import { Container } from '../../container';
import { BranchNode } from './branchNode';
import { RepositoriesView } from '../repositoriesView';
import { CommitsView } from '../commitsView';

export class CommitsNode extends ViewNode<RepositoriesView | CommitsView> {
	constructor(view: RepositoriesView | CommitsView) {
		super(unknownGitUri, view);
	}

	async getChildren(): Promise<ViewNode[]> {
		const repositories = await Container.git.getOrderedRepositories();
		if (repositories.length === 0) return [new MessageNode(this.view, this, 'No commits could be found.')];

		// if (repositories.length === 1) {
		// 	const status = await repositories[0].getStatus();
		// 	if (status == null) return [new MessageNode(this.view, this, 'No commits could be found.')];

		// 	const branch = new BranchNode(
		// 		this.uri,
		// 		this.view,
		// 		this,
		// 		new GitBranch(
		// 			status.repoPath,
		// 			status.branch,
		// 			false,
		// 			true,
		// 			undefined,
		// 			status.sha,
		// 			status.upstream,
		// 			status.state.ahead,
		// 			status.state.behind,
		// 			status.detached,
		// 		),
		// 		true,
		// 	);

		// 	return branch.getChildren();
		// }

		const branches = (
			await Promise.all(
				repositories.map(async repo => {
					const status = await repo.getStatus();
					if (status == null) return undefined;

					const node = new BranchNode(
						GitUri.fromRepoPath(repo.path),
						this.view,
						this,
						new GitBranch(
							status.repoPath,
							status.branch,
							false,
							true,
							undefined,
							status.sha,
							status.upstream,
							status.state.ahead,
							status.state.behind,
							status.detached,
						),
						false,
					);

					return node;
				}),
			)
		).filter(b => b !== undefined);

		if (branches.length === 1) {
			return branches[0]?.getChildren() ?? [];
		}

		return branches as any;
	}

	getTreeItem(): TreeItem {
		const item = new TreeItem('Commits', TreeItemCollapsibleState.Expanded);
		item.contextValue = ResourceType.Commits;
		return item;
	}
}
