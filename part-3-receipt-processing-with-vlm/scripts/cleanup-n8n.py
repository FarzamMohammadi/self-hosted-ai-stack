#!/usr/bin/env python3
"""
N8N Cleanup Script - Delete workflows and credentials.

Usage:
  python scripts/cleanup-n8n.py                    # Delete inactive workflows + credentials
  python scripts/cleanup-n8n.py --dry-run          # Preview what would be deleted
  python scripts/cleanup-n8n.py --include-active   # Delete ALL workflows (requires confirmation)
  python scripts/cleanup-n8n.py --include-active -y # Delete ALL workflows (skip confirmation)
"""

import argparse
import sys
from typing import Any, Dict, List, Set

from utils.n8n_common import (
    N8NAPIError,
    api_request,
    confirm_action,
    load_env_file,
    print_error,
    print_header,
    print_success,
    print_warning,
    validate_required_vars,
)

# =============================================================================
# WORKFLOW OPERATIONS
# =============================================================================


def get_all_workflows(api_key: str) -> List[Dict[str, Any]]:
    """
    Fetch all workflows from n8n.

    Args:
        api_key: n8n API key

    Returns:
        List of workflow dictionaries
    """
    result = api_request('GET', '/workflows', api_key)
    return result.get('data', []) if result else []


def extract_credential_ids(workflows: List[Dict[str, Any]]) -> Set[str]:
    """
    Extract all credential IDs referenced in workflows.

    Args:
        workflows: List of workflow dictionaries

    Returns:
        Set of credential ID strings
    """
    credential_ids: Set[str] = set()

    for workflow in workflows:
        for node in workflow.get('nodes', []):
            if 'credentials' in node:
                for cred_type, cred_info in node['credentials'].items():
                    if isinstance(cred_info, dict) and 'id' in cred_info:
                        credential_ids.add(cred_info['id'])

    return credential_ids


def delete_workflows(
    api_key: str,
    include_active: bool,
    dry_run: bool = False,
) -> tuple[int, int]:
    """
    Delete workflows based on active status.

    Args:
        api_key: n8n API key
        include_active: Whether to include active workflows
        dry_run: If True, only preview what would be deleted

    Returns:
        Tuple of (deleted_count, failed_count)
    """
    print('🗑️  Fetching workflows...')
    workflows = get_all_workflows(api_key)

    if not workflows:
        print('   No workflows found')
        return 0, 0

    active_workflows = [w for w in workflows if w.get('active', False)]
    inactive_workflows = [w for w in workflows if not w.get('active', False)]

    print(f'   Found {len(workflows)} workflow(s):')
    print(f'   - {len(active_workflows)} active')
    print(f'   - {len(inactive_workflows)} inactive')

    # Decide which to delete
    if include_active:
        to_delete = workflows
        action = 'Would delete' if dry_run else 'Deleting'
        print(f'\n🗑️  {action} ALL workflows...')
    else:
        to_delete = inactive_workflows
        action = 'Would delete' if dry_run else 'Deleting'
        print(f'\n🗑️  {action} inactive workflows only...')

    if not to_delete:
        print('   Nothing to delete')
        return 0, 0

    deleted_count = 0
    failed_count = 0

    for workflow in to_delete:
        name = workflow.get('name', 'Unknown')
        if dry_run:
            status = '🔵 active' if workflow.get('active') else '⚪ inactive'
            print(f'   → {name} ({status})')
            deleted_count += 1
        else:
            try:
                api_request('DELETE', f'/workflows/{workflow["id"]}', api_key)
                print_success(f'Deleted: {name}')
                deleted_count += 1
            except N8NAPIError as e:
                print_error(f'Failed to delete {name}: {e}')
                failed_count += 1

    return deleted_count, failed_count


def delete_credentials(
    api_key: str,
    credential_ids: Set[str],
    dry_run: bool = False,
) -> tuple[int, int]:
    """
    Delete credentials by ID.

    Args:
        api_key: n8n API key
        credential_ids: Set of credential IDs to delete
        dry_run: If True, only preview what would be deleted

    Returns:
        Tuple of (deleted_count, failed_count)
    """
    if not credential_ids:
        print('\n   No credentials to delete')
        return 0, 0

    action = 'Would delete' if dry_run else 'Deleting'
    print(f'\n🗑️  {action} {len(credential_ids)} credential(s)...')

    deleted_count = 0
    failed_count = 0

    for cred_id in credential_ids:
        if dry_run:
            print(f'   → Credential ID: {cred_id}')
            deleted_count += 1
        else:
            try:
                api_request('DELETE', f'/credentials/{cred_id}', api_key)
                print_success(f'Deleted credential (ID: {cred_id})')
                deleted_count += 1
            except N8NAPIError as e:
                print_error(f'Failed to delete credential {cred_id}: {e}')
                failed_count += 1

    return deleted_count, failed_count


# =============================================================================
# MAIN
# =============================================================================


def main() -> None:
    """Main entry point for n8n cleanup."""
    parser = argparse.ArgumentParser(
        description='Delete n8n workflows and credentials',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python scripts/cleanup-n8n.py                    # Delete inactive workflows + credentials
  python scripts/cleanup-n8n.py --dry-run          # Preview what would be deleted
  python scripts/cleanup-n8n.py --include-active   # Delete ALL workflows (requires confirmation)
  python scripts/cleanup-n8n.py --include-active -y # Delete ALL without confirmation
        '''
    )
    parser.add_argument(
        '--include-active',
        action='store_true',
        help='Delete active workflows too (default: only delete inactive workflows)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview what would be deleted without actually deleting'
    )
    parser.add_argument(
        '-y', '--yes',
        action='store_true',
        help='Skip confirmation prompts'
    )

    args = parser.parse_args()

    if args.dry_run:
        print_header('🔍 N8N Cleanup (DRY RUN)')
    else:
        print_header('🗑️  N8N Cleanup')

    try:
        # Load environment
        env = load_env_file()
        validate_required_vars(env, ['N8N_API_KEY'])
        api_key = env['N8N_API_KEY']

        # Get all workflows to extract credential IDs before deleting
        workflows = get_all_workflows(api_key)
        credential_ids = extract_credential_ids(workflows)

        # Confirmation for dangerous operations
        if args.include_active and not args.dry_run and not args.yes:
            active_count = sum(1 for w in workflows if w.get('active', False))
            if active_count > 0:
                print(f'\n⚠️  This will delete {active_count} ACTIVE workflow(s)!')
                if not confirm_action('Are you sure you want to continue?', default=False):
                    print('Cancelled.')
                    sys.exit(0)

        # Delete workflows
        deleted_workflows, failed_workflows = delete_workflows(
            api_key, args.include_active, args.dry_run
        )

        # Delete credentials
        deleted_credentials, failed_credentials = delete_credentials(
            api_key, credential_ids, args.dry_run
        )

        # Summary
        total_failed = failed_workflows + failed_credentials

        if args.dry_run:
            print_header('🔍 Dry run complete')
            print(f'   Would delete {deleted_workflows} workflow(s)')
            print(f'   Would delete {deleted_credentials} credential(s)')
        else:
            print_header('✅ Cleanup complete')
            print(f'   Deleted {deleted_workflows} workflow(s)')
            print(f'   Deleted {deleted_credentials} credential(s)')

            if total_failed > 0:
                print_warning(f'{total_failed} deletion(s) failed')
                sys.exit(1)

    except KeyboardInterrupt:
        print('\n\nCleanup cancelled by user.')
        sys.exit(130)
    except (FileNotFoundError, ValueError, N8NAPIError) as e:
        print_header('❌ Cleanup failed!')
        print(f'{e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
