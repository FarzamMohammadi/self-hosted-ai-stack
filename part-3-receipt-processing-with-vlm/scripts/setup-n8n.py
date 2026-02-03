#!/usr/bin/env python3
"""
N8N Setup Automation - Creates credentials and configures n8n via API.

Usage: python scripts/setup-n8n.py
"""

import json
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from utils.n8n_common import (
    N8NAPIError,
    WORKFLOWS_DIR,
    api_request,
    load_env_file,
    print_error,
    print_header,
    print_success,
    print_warning,
    validate_api_connectivity,
    validate_api_key,
    validate_required_vars,
)

# =============================================================================
# CONFIGURATION
# =============================================================================

REQUIRED_ENV_VARS = [
    'N8N_API_KEY',
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_PORT',
]

# =============================================================================
# SETUP OPERATIONS
# =============================================================================


def create_postgres_credential(env: Dict[str, str], api_key: str) -> Optional[Dict[str, Any]]:
    """
    Create PostgreSQL credential in n8n.

    Args:
        env: Environment variables dictionary
        api_key: n8n API key

    Returns:
        Created credential data, or None if it already exists
    """
    print('\n🗄️  Creating PostgreSQL credential...')

    credential_name = 'Receipt Manager DB'

    # Allow configurable postgres host (default: 'postgres' for docker network)
    postgres_host = env.get('POSTGRES_HOST', 'postgres')

    credential_data = {
        'name': credential_name,
        'type': 'postgres',
        'data': {
            'host': postgres_host,
            'database': env['POSTGRES_DB'],
            'user': env['POSTGRES_USER'],
            'password': env['POSTGRES_PASSWORD'],
            'port': int(env['POSTGRES_PORT']),
            'ssl': 'disable',
            'sshTunnel': False,
        },
    }

    try:
        result = api_request('POST', '/credentials', api_key, credential_data)
        if result:
            print_success(f"Created credential: {result['name']} (ID: {result['id']})")
            return result
        return None
    except N8NAPIError as e:
        if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
            print_warning(f'Credential "{credential_name}" already exists, skipping')
            return None
        raise


def replace_credential_ids(workflow_data: Dict[str, Any], credential_id: str) -> Dict[str, Any]:
    """
    Replace all postgres credential IDs in workflow with actual credential ID.

    Args:
        workflow_data: Workflow JSON data
        credential_id: Actual credential ID to use

    Returns:
        Modified workflow data
    """
    if 'nodes' in workflow_data:
        for node in workflow_data['nodes']:
            if 'credentials' in node and 'postgres' in node['credentials']:
                node['credentials']['postgres']['id'] = credential_id
    return workflow_data


def inject_webhook_ids(workflow_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add unique webhookId to all webhook nodes for proper API registration.

    This is a workaround for a known n8n bug where webhooks created via API
    don't register properly without a webhookId field.
    See: https://github.com/n8n-io/n8n/issues/21614

    Args:
        workflow_data: Workflow JSON data

    Returns:
        Modified workflow data with webhookIds
    """
    if 'nodes' in workflow_data:
        for node in workflow_data['nodes']:
            if node.get('type') == 'n8n-nodes-base.webhook':
                if 'webhookId' not in node:
                    node['webhookId'] = str(uuid.uuid4())
    return workflow_data


def clean_workflow_for_api(workflow_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove fields not accepted by the n8n API.

    The API rejects fields like versionId, id, createdAt, active, etc.
    Only whitelisted fields are kept.

    Args:
        workflow_data: Raw workflow JSON data

    Returns:
        Cleaned workflow data ready for API submission
    """
    allowed_fields = ['name', 'nodes', 'connections', 'settings', 'staticData', 'tags']
    return {k: v for k, v in workflow_data.items() if k in allowed_fields}


def upload_single_workflow(
    workflow_file: Path,
    api_key: str,
    credential_id: Optional[str],
) -> Optional[str]:
    """
    Upload and activate a single workflow.

    Args:
        workflow_file: Path to the workflow JSON file
        api_key: n8n API key
        credential_id: Optional credential ID to inject

    Returns:
        Workflow ID if activation failed (for tracking), None on full success
    """
    with open(workflow_file, 'r') as f:
        workflow_data = json.load(f)

    if credential_id:
        workflow_data = replace_credential_ids(workflow_data, credential_id)

    workflow_data = inject_webhook_ids(workflow_data)
    workflow_data = clean_workflow_for_api(workflow_data)

    result = api_request('POST', '/workflows', api_key, workflow_data)
    if not result:
        print_error(f'Failed to upload {workflow_file.name}')
        return None

    workflow_id = result['id']
    workflow_name = result.get('name', workflow_file.name)
    print_success(f'Uploaded: {workflow_name} (ID: {workflow_id})')

    try:
        api_request('POST', f'/workflows/{workflow_id}/activate', api_key)
        print_success(f'Activated: {workflow_name}')
        return None
    except N8NAPIError as e:
        print_warning(f'Activation failed: {e}')
        return workflow_id


def upload_workflows(api_key: str, credential_id: Optional[str]) -> List[str]:
    """
    Upload workflow JSON files from n8n/workflows directory.

    Args:
        api_key: n8n API key
        credential_id: Credential ID to inject into workflows

    Returns:
        List of workflow IDs that failed to activate
    """
    print('\n📤 Uploading and activating workflows...')

    failed_activations: List[str] = []

    if not WORKFLOWS_DIR.exists():
        print_warning(f'Workflows directory not found: {WORKFLOWS_DIR}')
        return failed_activations

    workflow_files = list(WORKFLOWS_DIR.glob('*.json'))

    if not workflow_files:
        print_warning(f'No workflow files found in {WORKFLOWS_DIR}')
        return failed_activations

    total = len(workflow_files)
    print(f'   Found {total} workflow file(s)')

    for i, workflow_file in enumerate(workflow_files, 1):
        try:
            print(f'   → Processing {workflow_file.name} ({i}/{total})...')
            failed_id = upload_single_workflow(workflow_file, api_key, credential_id)
            if failed_id:
                failed_activations.append(failed_id)

        except json.JSONDecodeError as e:
            print_error(f'Invalid JSON in {workflow_file.name}: {e}')
        except N8NAPIError as e:
            if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                print_warning('Workflow already exists, skipping')
            else:
                print_error(f'Failed: {e}')

    print_success('Workflow processing complete')
    return failed_activations


# =============================================================================
# MAIN
# =============================================================================


def main() -> None:
    """Main entry point for n8n setup."""
    print_header('🚀 N8N Setup Automation')

    try:
        print('\n🔍 Running validations...')

        env = load_env_file()
        print_success('.env file found')

        validate_required_vars(env, REQUIRED_ENV_VARS)
        print_success('All required variables present')

        validate_api_connectivity()
        print_success('n8n API is accessible')

        validate_api_key(env['N8N_API_KEY'])
        print_success('API key is valid')

        print('\n📦 Running setup operations...')

        credential_result = create_postgres_credential(env, env['N8N_API_KEY'])
        credential_id = credential_result['id'] if credential_result else None

        upload_workflows(env['N8N_API_KEY'], credential_id)

        print_header('✅ Setup completed successfully!')

        # Warning about known n8n bug and offer to restart
        print('\n\033[33m⚠️  IMPORTANT: Due to a known n8n bug, webhooks may not respond')
        print('   until you restart the n8n container.\033[0m\n')

        restart = input('Would you like me to run "docker compose restart n8n" for you? [y/N]: ').strip().lower()
        if restart == 'y':
            print('\n🔄 Restarting n8n container...')
            result = subprocess.run(['docker', 'compose', 'restart', 'n8n'], capture_output=True, text=True)
            if result.returncode == 0:
                print_success('n8n container restarted successfully')
            else:
                print_error(f'Failed to restart: {result.stderr}')
        else:
            print('\n   Run manually when ready: docker compose restart n8n\n')

    except KeyboardInterrupt:
        print('\n\nSetup cancelled by user.')
        sys.exit(130)
    except (FileNotFoundError, ValueError, ConnectionError, N8NAPIError) as e:
        print_header('❌ Setup failed!')
        print(f'{e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
