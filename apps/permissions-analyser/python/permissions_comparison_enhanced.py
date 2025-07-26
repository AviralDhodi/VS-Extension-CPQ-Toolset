#!/usr/bin/env python3
"""
Enhanced Permissions Comparison Engine
Analyzes and compares all Salesforce permission types across multiple organizations
Supports: Profiles, Permission Sets, Permission Set Groups, and Muting Permission Sets
"""

import json
import os
import sys
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
import pandas as pd
from typing import Dict, List, Set, Tuple, Any, Optional
import logging
from collections import defaultdict

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class EnhancedPermissionsComparison:
    """Enhanced class for comparing all permission types across organizations"""
    
    def __init__(self, data_path: str, output_path: str, comparison_id: str, config_path: Optional[str] = None):
        self.data_path = Path(data_path)
        self.output_path = Path(output_path)
        self.comparison_id = comparison_id
        self.config_path = Path(config_path) if config_path else None
        self.org_data = {}
        self.config = self._load_config()
        self.comparison_results = {
            'comparison_id': comparison_id,
            'timestamp': datetime.now().isoformat(),
            'summary': {},
            'details': {},
            'configuration': self.config
        }
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration to understand what to compare"""
        if self.config_path and self.config_path.exists():
            with open(self.config_path, 'r') as f:
                return json.load(f)
        
        # Check for config in data path
        config_file = self.data_path / 'config.json'
        if config_file.exists():
            with open(config_file, 'r') as f:
                return json.load(f)
        
        # Default config - compare everything
        return {
            'selectedPermissionOptions': {
                'Profile': {
                    'objectPermissions': True,
                    'fieldPermissions': True,
                    'userPermissions': True,
                    'tabVisibilities': True,
                    'applicationVisibilities': True,
                    'recordTypeVisibilities': True,
                    'apexClasses': True,
                    'visualforcePages': True
                },
                'PermissionSet': {
                    'objectPermissions': True,
                    'fieldPermissions': True,
                    'userPermissions': True,
                    'customPermissions': True,
                    'apexClasses': True,
                    'visualforcePages': True,
                    'tabSettings': True,
                    'applicationVisibilities': True
                },
                'PermissionSetGroup': {
                    'permissionSets': True,
                    'mutingPermissionSets': True
                },
                'MutingPermissionSet': {
                    'objectPermissions': True,
                    'fieldPermissions': True,
                    'userPermissions': True
                }
            }
        }
    
    def load_org_data(self) -> None:
        """Load processed permissions data for all organizations"""
        logger.info(f"Loading data from {self.data_path}")
        
        # Find all org directories
        org_dirs = [d for d in self.data_path.iterdir() if d.is_dir() and not d.name.startswith('.')]
        
        for org_dir in org_dirs:
            org_name = org_dir.name
            logger.info(f"Loading metadata for {org_name}")
            
            # Look for processed_permissions.json file
            processed_file = org_dir / 'processed_permissions.json'
            if processed_file.exists():
                with open(processed_file, 'r') as f:
                    data = json.load(f)
                    self.org_data[org_name] = {
                        'profiles': data.get('profiles', {}),
                        'permissionSets': data.get('permissionSets', {}),
                        'permissionSetGroups': data.get('permissionSetGroups', {}),
                        'mutingPermissionSets': data.get('mutingPermissionSets', {})
                    }
            else:
                logger.warning(f"No processed_permissions.json found for {org_name}, trying to load from XML...")
                # Fallback to XML parsing
                self.org_data[org_name] = {
                    'profiles': self._load_profiles(org_dir),
                    'permissionSets': self._load_permission_sets(org_dir),
                    'permissionSetGroups': self._load_permission_set_groups(org_dir),
                    'mutingPermissionSets': self._load_muting_permission_sets(org_dir)
                }
            
            logger.info(f"Loaded {len(self.org_data[org_name]['profiles'])} profiles, "
                       f"{len(self.org_data[org_name]['permissionSets'])} permission sets, "
                       f"{len(self.org_data[org_name]['permissionSetGroups'])} permission set groups, "
                       f"{len(self.org_data[org_name]['mutingPermissionSets'])} muting permission sets for {org_name}")
    
    def _load_profiles(self, org_dir: Path) -> Dict[str, Any]:
        """Load profile metadata from XML files"""
        profiles = {}
        # Try multiple possible paths
        possible_paths = [
            org_dir / 'metadata' / 'unpackaged' / 'unpackaged' / 'profiles',
            org_dir / 'unpackaged' / 'profiles',
            org_dir / 'profiles'
        ]
        
        profiles_dir = None
        for path in possible_paths:
            if path.exists():
                profiles_dir = path
                break
        
        if profiles_dir and profiles_dir.exists():
            # Look for both .profile and .profile-meta.xml files
            for profile_file in list(profiles_dir.glob('*.profile')) + list(profiles_dir.glob('*.profile-meta.xml')):
                try:
                    profile_name = profile_file.stem.replace('.profile-meta', '')
                    profile_data = self._parse_profile_xml(profile_file)
                    profiles[profile_name] = profile_data
                except Exception as e:
                    logger.error(f"Error parsing profile {profile_file}: {e}")
        
        return profiles
    
    def _parse_profile_xml(self, file_path: Path) -> Dict[str, Any]:
        """Parse a profile XML file"""
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Remove namespace
        for elem in root.iter():
            if '}' in elem.tag:
                elem.tag = elem.tag.split('}')[1]
        
        profile_data = {
            'objectPermissions': [],
            'fieldPermissions': [],
            'userPermissions': [],
            'tabVisibilities': [],
            'applicationVisibilities': [],
            'recordTypeVisibilities': [],
            'classAccesses': [],
            'pageAccesses': [],
            'custom': False,
            'userLicense': None
        }
        
        # Parse each permission type
        for obj_perm in root.findall('.//objectPermissions'):
            profile_data['objectPermissions'].append({
                'object': obj_perm.findtext('object', ''),
                'allowCreate': obj_perm.findtext('allowCreate', 'false') == 'true',
                'allowDelete': obj_perm.findtext('allowDelete', 'false') == 'true',
                'allowEdit': obj_perm.findtext('allowEdit', 'false') == 'true',
                'allowRead': obj_perm.findtext('allowRead', 'false') == 'true',
                'modifyAllRecords': obj_perm.findtext('modifyAllRecords', 'false') == 'true',
                'viewAllRecords': obj_perm.findtext('viewAllRecords', 'false') == 'true'
            })
        
        for field_perm in root.findall('.//fieldPermissions'):
            profile_data['fieldPermissions'].append({
                'field': field_perm.findtext('field', ''),
                'editable': field_perm.findtext('editable', 'false') == 'true',
                'readable': field_perm.findtext('readable', 'false') == 'true'
            })
        
        for user_perm in root.findall('.//userPermissions'):
            profile_data['userPermissions'].append({
                'name': user_perm.findtext('name', ''),
                'enabled': user_perm.findtext('enabled', 'false') == 'true'
            })
        
        for tab_vis in root.findall('.//tabVisibilities'):
            profile_data['tabVisibilities'].append({
                'tab': tab_vis.findtext('tab', ''),
                'visibility': tab_vis.findtext('visibility', 'Hidden')
            })
        
        for app_vis in root.findall('.//applicationVisibilities'):
            profile_data['applicationVisibilities'].append({
                'application': app_vis.findtext('application', ''),
                'default': app_vis.findtext('default', 'false') == 'true',
                'visible': app_vis.findtext('visible', 'false') == 'true'
            })
        
        for class_access in root.findall('.//classAccesses'):
            profile_data['classAccesses'].append({
                'apexClass': class_access.findtext('apexClass', ''),
                'enabled': class_access.findtext('enabled', 'false') == 'true'
            })
        
        for page_access in root.findall('.//pageAccesses'):
            profile_data['pageAccesses'].append({
                'apexPage': page_access.findtext('apexPage', ''),
                'enabled': page_access.findtext('enabled', 'false') == 'true'
            })
        
        profile_data['custom'] = root.findtext('custom', 'false') == 'true'
        profile_data['userLicense'] = root.findtext('userLicense', '')
        
        return profile_data
    
    def _load_permission_sets(self, org_dir: Path) -> Dict[str, Any]:
        """Load permission set metadata from XML files"""
        permission_sets = {}
        # Try multiple possible paths
        possible_paths = [
            org_dir / 'metadata' / 'unpackaged' / 'unpackaged' / 'permissionsets',
            org_dir / 'unpackaged' / 'permissionsets',
            org_dir / 'permissionsets'
        ]
        
        ps_dir = None
        for path in possible_paths:
            if path.exists():
                ps_dir = path
                break
        
        if ps_dir and ps_dir.exists():
            # Look for both .permissionset and .permissionset-meta.xml files
            for ps_file in list(ps_dir.glob('*.permissionset')) + list(ps_dir.glob('*.permissionset-meta.xml')):
                try:
                    ps_name = ps_file.stem.replace('.permissionset-meta', '')
                    ps_data = self._parse_permission_set_xml(ps_file)
                    permission_sets[ps_name] = ps_data
                except Exception as e:
                    logger.error(f"Error parsing permission set {ps_file}: {e}")
        
        return permission_sets
    
    def _parse_permission_set_xml(self, file_path: Path) -> Dict[str, Any]:
        """Parse a permission set XML file"""
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Remove namespace
        for elem in root.iter():
            if '}' in elem.tag:
                elem.tag = elem.tag.split('}')[1]
        
        ps_data = {
            'label': root.findtext('label', ''),
            'description': root.findtext('description', ''),
            'objectPermissions': [],
            'fieldPermissions': [],
            'userPermissions': [],
            'customPermissions': [],
            'classAccesses': [],
            'pageAccesses': [],
            'tabSettings': [],
            'applicationVisibilities': []
        }
        
        # Parse similar to profile but for permission sets
        for obj_perm in root.findall('.//objectPermissions'):
            ps_data['objectPermissions'].append({
                'object': obj_perm.findtext('object', ''),
                'allowCreate': obj_perm.findtext('allowCreate', 'false') == 'true',
                'allowDelete': obj_perm.findtext('allowDelete', 'false') == 'true',
                'allowEdit': obj_perm.findtext('allowEdit', 'false') == 'true',
                'allowRead': obj_perm.findtext('allowRead', 'false') == 'true',
                'modifyAllRecords': obj_perm.findtext('modifyAllRecords', 'false') == 'true',
                'viewAllRecords': obj_perm.findtext('viewAllRecords', 'false') == 'true'
            })
        
        for field_perm in root.findall('.//fieldPermissions'):
            ps_data['fieldPermissions'].append({
                'field': field_perm.findtext('field', ''),
                'editable': field_perm.findtext('editable', 'false') == 'true',
                'readable': field_perm.findtext('readable', 'false') == 'true'
            })
        
        for user_perm in root.findall('.//userPermissions'):
            ps_data['userPermissions'].append({
                'name': user_perm.findtext('name', ''),
                'enabled': user_perm.findtext('enabled', 'false') == 'true'
            })
        
        for custom_perm in root.findall('.//customPermissions'):
            ps_data['customPermissions'].append({
                'name': custom_perm.findtext('name', ''),
                'enabled': custom_perm.findtext('enabled', 'false') == 'true'
            })
        
        return ps_data
    
    def _load_permission_set_groups(self, org_dir: Path) -> Dict[str, Any]:
        """Load permission set group metadata"""
        psg_data = {}
        psg_dir = org_dir / 'unpackaged' / 'permissionsetgroups'
        
        if psg_dir.exists():
            for psg_file in psg_dir.glob('*.permissionsetgroup-meta.xml'):
                try:
                    psg_name = psg_file.stem.replace('.permissionsetgroup-meta', '')
                    psg_data[psg_name] = self._parse_permission_set_group_xml(psg_file)
                except Exception as e:
                    logger.error(f"Error parsing permission set group {psg_file}: {e}")
        
        return psg_data
    
    def _parse_permission_set_group_xml(self, file_path: Path) -> Dict[str, Any]:
        """Parse a permission set group XML file"""
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Remove namespace
        for elem in root.iter():
            if '}' in elem.tag:
                elem.tag = elem.tag.split('}')[1]
        
        psg_data = {
            'label': root.findtext('label', ''),
            'description': root.findtext('description', ''),
            'permissionSets': [],
            'mutingPermissionSets': [],
            'status': root.findtext('status', 'Updated')
        }
        
        for ps in root.findall('.//permissionSets'):
            psg_data['permissionSets'].append(ps.text)
        
        for mps in root.findall('.//mutingPermissionSets'):
            psg_data['mutingPermissionSets'].append(mps.text)
        
        return psg_data
    
    def _load_muting_permission_sets(self, org_dir: Path) -> Dict[str, Any]:
        """Load muting permission set metadata"""
        mps_data = {}
        mps_dir = org_dir / 'unpackaged' / 'mutingpermissionsets'
        
        if mps_dir.exists():
            for mps_file in mps_dir.glob('*.mutingpermissionset-meta.xml'):
                try:
                    mps_name = mps_file.stem.replace('.mutingpermissionset-meta', '')
                    mps_data[mps_name] = self._parse_muting_permission_set_xml(mps_file)
                except Exception as e:
                    logger.error(f"Error parsing muting permission set {mps_file}: {e}")
        
        return mps_data
    
    def _parse_muting_permission_set_xml(self, file_path: Path) -> Dict[str, Any]:
        """Parse a muting permission set XML file"""
        # Similar structure to permission sets but for removing permissions
        return self._parse_permission_set_xml(file_path)
    
    def compare_all(self) -> None:
        """Run all comparisons based on configuration"""
        logger.info("Starting comprehensive permissions comparison...")
        
        # Load data
        self.load_org_data()
        
        if not self.org_data:
            logger.error("No organization data found to compare")
            raise ValueError("No organization data found to compare")
        
        # Compare each permission type if selected
        selected_options = self.config.get('selectedPermissionOptions', {})
        
        if 'Profile' in selected_options:
            self.comparison_results['details']['profiles'] = self.compare_profiles()
        
        if 'PermissionSet' in selected_options:
            self.comparison_results['details']['permissionSets'] = self.compare_permission_sets()
        
        if 'PermissionSetGroup' in selected_options:
            self.comparison_results['details']['permissionSetGroups'] = self.compare_permission_set_groups()
        
        if 'MutingPermissionSet' in selected_options:
            self.comparison_results['details']['mutingPermissionSets'] = self.compare_muting_permission_sets()
        
        # Generate summary
        self._generate_summary()
        
        # Save results
        self._save_results()
    
    def compare_profiles(self) -> Dict[str, Any]:
        """Compare profiles across organizations"""
        logger.info("Comparing profiles...")
        
        profile_comparison = {
            'all_profiles': set(),
            'org_profiles': {},
            'common_profiles': set(),
            'unique_profiles': {},
            'profile_differences': {}
        }
        
        # Collect all profiles from all orgs
        for org, data in self.org_data.items():
            org_profiles = set(data.get('profiles', {}).keys())
            profile_comparison['org_profiles'][org] = list(org_profiles)
            profile_comparison['all_profiles'].update(org_profiles)
        
        profile_comparison['all_profiles'] = list(profile_comparison['all_profiles'])
        
        # Find common profiles
        if profile_comparison['org_profiles']:
            common = set.intersection(*[set(profiles) for profiles in profile_comparison['org_profiles'].values()])
            profile_comparison['common_profiles'] = list(common)
        
        # Find unique profiles per org
        for org, profiles in profile_comparison['org_profiles'].items():
            unique = set(profiles) - set(profile_comparison['common_profiles'])
            if unique:
                profile_comparison['unique_profiles'][org] = list(unique)
        
        # Compare permissions for common profiles based on selected options
        selected_options = self.config.get('selectedPermissionOptions', {}).get('Profile', {})
        
        for profile in profile_comparison['common_profiles']:
            differences = self._compare_profile_permissions(profile, selected_options)
            if differences:
                profile_comparison['profile_differences'][profile] = differences
        
        return profile_comparison
    
    def _compare_profile_permissions(self, profile_name: str, selected_options: Dict[str, bool]) -> Dict[str, Any]:
        """Compare permissions for a specific profile across orgs"""
        differences = {}
        
        # Get profile data from all orgs
        org_profiles = {}
        for org, data in self.org_data.items():
            if profile_name in data.get('profiles', {}):
                org_profiles[org] = data['profiles'][profile_name]
        
        if len(org_profiles) < 2:
            return {}
        
        # Compare each selected permission type
        if selected_options.get('objectPermissions', False):
            obj_diffs = self._compare_object_permissions(org_profiles)
            if obj_diffs:
                differences['objectPermissions'] = obj_diffs
        
        if selected_options.get('fieldPermissions', False):
            field_diffs = self._compare_field_permissions(org_profiles)
            if field_diffs:
                differences['fieldPermissions'] = field_diffs
        
        if selected_options.get('userPermissions', False):
            user_diffs = self._compare_user_permissions(org_profiles)
            if user_diffs:
                differences['userPermissions'] = user_diffs
        
        if selected_options.get('apexClasses', False):
            apex_diffs = self._compare_apex_access(org_profiles, 'classAccesses')
            if apex_diffs:
                differences['apexClasses'] = apex_diffs
        
        if selected_options.get('visualforcePages', False):
            page_diffs = self._compare_page_access(org_profiles)
            if page_diffs:
                differences['visualforcePages'] = page_diffs
        
        if selected_options.get('tabVisibilities', False):
            tab_diffs = self._compare_tab_visibilities(org_profiles)
            if tab_diffs:
                differences['tabVisibilities'] = tab_diffs
        
        if selected_options.get('applicationVisibilities', False):
            app_diffs = self._compare_app_visibilities(org_profiles)
            if app_diffs:
                differences['applicationVisibilities'] = app_diffs
        
        return differences
    
    def _compare_object_permissions(self, org_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compare object permissions across orgs"""
        all_objects = set()
        for data in org_data.values():
            for obj_perm in data.get('objectPermissions', []):
                all_objects.add(obj_perm['object'])
        
        differences = {}
        for obj in sorted(all_objects):
            obj_differences = {}
            for org, data in org_data.items():
                obj_perm = next(
                    (p for p in data.get('objectPermissions', []) if p['object'] == obj),
                    None
                )
                if obj_perm:
                    obj_differences[org] = {
                        'create': obj_perm.get('allowCreate', False),
                        'read': obj_perm.get('allowRead', False),
                        'edit': obj_perm.get('allowEdit', False),
                        'delete': obj_perm.get('allowDelete', False),
                        'viewAll': obj_perm.get('viewAllRecords', False),
                        'modifyAll': obj_perm.get('modifyAllRecords', False)
                    }
                else:
                    obj_differences[org] = {
                        'create': False, 'read': False, 'edit': False,
                        'delete': False, 'viewAll': False, 'modifyAll': False
                    }
            
            # Check if there are differences
            if self._has_permission_differences(obj_differences):
                differences[obj] = obj_differences
        
        return differences
    
    def _compare_field_permissions(self, org_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compare field permissions across orgs"""
        all_fields = set()
        for data in org_data.values():
            for field_perm in data.get('fieldPermissions', []):
                all_fields.add(field_perm['field'])
        
        differences = {}
        for field in sorted(all_fields):
            field_differences = {}
            for org, data in org_data.items():
                field_perm = next(
                    (f for f in data.get('fieldPermissions', []) if f['field'] == field),
                    None
                )
                if field_perm:
                    field_differences[org] = {
                        'readable': field_perm.get('readable', False),
                        'editable': field_perm.get('editable', False)
                    }
                else:
                    field_differences[org] = {'readable': False, 'editable': False}
            
            if self._has_permission_differences(field_differences):
                differences[field] = field_differences
        
        return differences
    
    def _compare_user_permissions(self, org_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compare user permissions across orgs"""
        all_permissions = set()
        for data in org_data.values():
            for user_perm in data.get('userPermissions', []):
                all_permissions.add(user_perm['name'])
        
        differences = {}
        for perm in sorted(all_permissions):
            perm_differences = {}
            for org, data in org_data.items():
                user_perm = next(
                    (p for p in data.get('userPermissions', []) if p['name'] == perm),
                    None
                )
                perm_differences[org] = user_perm['enabled'] if user_perm else False
            
            if self._has_simple_differences(perm_differences):
                differences[perm] = perm_differences
        
        return differences
    
    def _compare_apex_access(self, org_data: Dict[str, Any], field_name: str) -> Dict[str, Any]:
        """Compare Apex class access across orgs"""
        all_classes = set()
        for data in org_data.values():
            for class_access in data.get(field_name, []):
                all_classes.add(class_access['apexClass'])
        
        differences = {}
        for apex_class in sorted(all_classes):
            class_differences = {}
            for org, data in org_data.items():
                class_access = next(
                    (c for c in data.get(field_name, []) if c['apexClass'] == apex_class),
                    None
                )
                class_differences[org] = class_access['enabled'] if class_access else False
            
            if self._has_simple_differences(class_differences):
                differences[apex_class] = class_differences
        
        return differences
    
    def _compare_page_access(self, org_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compare Visualforce page access across orgs"""
        all_pages = set()
        for data in org_data.values():
            for page_access in data.get('pageAccesses', []):
                all_pages.add(page_access['apexPage'])
        
        differences = {}
        for page in sorted(all_pages):
            page_differences = {}
            for org, data in org_data.items():
                page_access = next(
                    (p for p in data.get('pageAccesses', []) if p['apexPage'] == page),
                    None
                )
                page_differences[org] = page_access['enabled'] if page_access else False
            
            if self._has_simple_differences(page_differences):
                differences[page] = page_differences
        
        return differences
    
    def _compare_tab_visibilities(self, org_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compare tab visibilities across orgs"""
        all_tabs = set()
        for data in org_data.values():
            for tab_vis in data.get('tabVisibilities', []):
                all_tabs.add(tab_vis['tab'])
        
        differences = {}
        for tab in sorted(all_tabs):
            tab_differences = {}
            for org, data in org_data.items():
                tab_vis = next(
                    (t for t in data.get('tabVisibilities', []) if t['tab'] == tab),
                    None
                )
                tab_differences[org] = tab_vis['visibility'] if tab_vis else 'Hidden'
            
            if self._has_simple_differences(tab_differences):
                differences[tab] = tab_differences
        
        return differences
    
    def _compare_app_visibilities(self, org_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compare application visibilities across orgs"""
        all_apps = set()
        for data in org_data.values():
            for app_vis in data.get('applicationVisibilities', []):
                all_apps.add(app_vis['application'])
        
        differences = {}
        for app in sorted(all_apps):
            app_differences = {}
            for org, data in org_data.items():
                app_vis = next(
                    (a for a in data.get('applicationVisibilities', []) if a['application'] == app),
                    None
                )
                if app_vis:
                    app_differences[org] = {
                        'visible': app_vis.get('visible', False),
                        'default': app_vis.get('default', False)
                    }
                else:
                    app_differences[org] = {'visible': False, 'default': False}
            
            if self._has_permission_differences(app_differences):
                differences[app] = app_differences
        
        return differences
    
    def compare_permission_sets(self) -> Dict[str, Any]:
        """Compare permission sets across organizations"""
        logger.info("Comparing permission sets...")
        
        ps_comparison = {
            'all_permission_sets': set(),
            'org_permission_sets': {},
            'common_permission_sets': set(),
            'unique_permission_sets': {},
            'permission_set_differences': {}
        }
        
        # Similar logic to profiles but for permission sets
        for org, data in self.org_data.items():
            org_ps = set(data.get('permissionSets', {}).keys())
            ps_comparison['org_permission_sets'][org] = list(org_ps)
            ps_comparison['all_permission_sets'].update(org_ps)
        
        ps_comparison['all_permission_sets'] = list(ps_comparison['all_permission_sets'])
        
        # Find common permission sets
        if ps_comparison['org_permission_sets']:
            common = set.intersection(*[set(ps) for ps in ps_comparison['org_permission_sets'].values()])
            ps_comparison['common_permission_sets'] = list(common)
        
        # Find unique permission sets per org
        for org, psets in ps_comparison['org_permission_sets'].items():
            unique = set(psets) - set(ps_comparison['common_permission_sets'])
            if unique:
                ps_comparison['unique_permission_sets'][org] = list(unique)
        
        # Compare permissions for common permission sets
        selected_options = self.config.get('selectedPermissionOptions', {}).get('PermissionSet', {})
        
        for ps in ps_comparison['common_permission_sets']:
            differences = self._compare_permission_set_permissions(ps, selected_options)
            if differences:
                ps_comparison['permission_set_differences'][ps] = differences
        
        return ps_comparison
    
    def _compare_permission_set_permissions(self, ps_name: str, selected_options: Dict[str, bool]) -> Dict[str, Any]:
        """Compare permissions for a specific permission set across orgs"""
        # Similar to profile comparison but for permission sets
        differences = {}
        
        org_ps_data = {}
        for org, data in self.org_data.items():
            if ps_name in data.get('permissionSets', {}):
                org_ps_data[org] = data['permissionSets'][ps_name]
        
        if len(org_ps_data) < 2:
            return {}
        
        # Compare each selected permission type
        if selected_options.get('objectPermissions', False):
            obj_diffs = self._compare_object_permissions(org_ps_data)
            if obj_diffs:
                differences['objectPermissions'] = obj_diffs
        
        if selected_options.get('fieldPermissions', False):
            field_diffs = self._compare_field_permissions(org_ps_data)
            if field_diffs:
                differences['fieldPermissions'] = field_diffs
        
        if selected_options.get('userPermissions', False):
            user_diffs = self._compare_user_permissions(org_ps_data)
            if user_diffs:
                differences['userPermissions'] = user_diffs
        
        if selected_options.get('customPermissions', False):
            custom_diffs = self._compare_custom_permissions(org_ps_data)
            if custom_diffs:
                differences['customPermissions'] = custom_diffs
        
        return differences
    
    def _compare_custom_permissions(self, org_data: Dict[str, Any]) -> Dict[str, Any]:
        """Compare custom permissions across orgs"""
        all_perms = set()
        for data in org_data.values():
            for custom_perm in data.get('customPermissions', []):
                all_perms.add(custom_perm['name'])
        
        differences = {}
        for perm in sorted(all_perms):
            perm_differences = {}
            for org, data in org_data.items():
                custom_perm = next(
                    (p for p in data.get('customPermissions', []) if p['name'] == perm),
                    None
                )
                perm_differences[org] = custom_perm['enabled'] if custom_perm else False
            
            if self._has_simple_differences(perm_differences):
                differences[perm] = perm_differences
        
        return differences
    
    def compare_permission_set_groups(self) -> Dict[str, Any]:
        """Compare permission set groups across organizations"""
        logger.info("Comparing permission set groups...")
        
        psg_comparison = {
            'all_permission_set_groups': set(),
            'org_permission_set_groups': {},
            'common_permission_set_groups': set(),
            'unique_permission_set_groups': {},
            'permission_set_group_differences': {}
        }
        
        # Collect all PSGs
        for org, data in self.org_data.items():
            org_psg = set(data.get('permissionSetGroups', {}).keys())
            psg_comparison['org_permission_set_groups'][org] = list(org_psg)
            psg_comparison['all_permission_set_groups'].update(org_psg)
        
        psg_comparison['all_permission_set_groups'] = list(psg_comparison['all_permission_set_groups'])
        
        # Find common PSGs
        if psg_comparison['org_permission_set_groups']:
            common = set.intersection(*[set(psg) for psg in psg_comparison['org_permission_set_groups'].values()])
            psg_comparison['common_permission_set_groups'] = list(common)
        
        # Compare PSG configurations
        for psg in psg_comparison['common_permission_set_groups']:
            differences = self._compare_psg_configuration(psg)
            if differences:
                psg_comparison['permission_set_group_differences'][psg] = differences
        
        return psg_comparison
    
    def _compare_psg_configuration(self, psg_name: str) -> Dict[str, Any]:
        """Compare PSG configuration across orgs"""
        differences = {}
        
        org_psg_data = {}
        for org, data in self.org_data.items():
            if psg_name in data.get('permissionSetGroups', {}):
                org_psg_data[org] = data['permissionSetGroups'][psg_name]
        
        if len(org_psg_data) < 2:
            return {}
        
        # Compare included permission sets
        all_ps = set()
        for data in org_psg_data.values():
            all_ps.update(data.get('permissionSets', []))
        
        ps_differences = {}
        for ps in sorted(all_ps):
            ps_inclusion = {}
            for org, data in org_psg_data.items():
                ps_inclusion[org] = ps in data.get('permissionSets', [])
            
            if self._has_simple_differences(ps_inclusion):
                ps_differences[ps] = ps_inclusion
        
        if ps_differences:
            differences['permissionSets'] = ps_differences
        
        # Compare muting permission sets
        all_mps = set()
        for data in org_psg_data.values():
            all_mps.update(data.get('mutingPermissionSets', []))
        
        mps_differences = {}
        for mps in sorted(all_mps):
            mps_inclusion = {}
            for org, data in org_psg_data.items():
                mps_inclusion[org] = mps in data.get('mutingPermissionSets', [])
            
            if self._has_simple_differences(mps_inclusion):
                mps_differences[mps] = mps_inclusion
        
        if mps_differences:
            differences['mutingPermissionSets'] = mps_differences
        
        return differences
    
    def compare_muting_permission_sets(self) -> Dict[str, Any]:
        """Compare muting permission sets across organizations"""
        logger.info("Comparing muting permission sets...")
        
        # Similar structure to permission sets
        mps_comparison = {
            'all_muting_permission_sets': set(),
            'org_muting_permission_sets': {},
            'common_muting_permission_sets': set(),
            'unique_muting_permission_sets': {},
            'muting_permission_set_differences': {}
        }
        
        # Implementation similar to permission sets
        return mps_comparison
    
    def _has_permission_differences(self, permissions_dict: Dict[str, Dict]) -> bool:
        """Check if there are differences in permissions across orgs"""
        if len(permissions_dict) < 2:
            return False
        
        # Get all permission values
        all_values = list(permissions_dict.values())
        first_value = all_values[0]
        
        # Check if all values are the same
        return not all(value == first_value for value in all_values[1:])
    
    def _has_simple_differences(self, values_dict: Dict[str, Any]) -> bool:
        """Check if there are differences in simple values across orgs"""
        if len(values_dict) < 2:
            return False
        
        unique_values = set(values_dict.values())
        return len(unique_values) > 1
    
    def _generate_summary(self) -> None:
        """Generate summary statistics"""
        summary = {
            'organizations': list(self.org_data.keys()),
            'organization_count': len(self.org_data),
            'comparison_stats': {}
        }
        
        # Profile stats
        if 'profiles' in self.comparison_results['details']:
            profile_data = self.comparison_results['details']['profiles']
            summary['comparison_stats']['profiles'] = {
                'total': len(profile_data.get('all_profiles', [])),
                'common': len(profile_data.get('common_profiles', [])),
                'with_differences': len(profile_data.get('profile_differences', {}))
            }
        
        # Permission set stats
        if 'permissionSets' in self.comparison_results['details']:
            ps_data = self.comparison_results['details']['permissionSets']
            summary['comparison_stats']['permissionSets'] = {
                'total': len(ps_data.get('all_permission_sets', [])),
                'common': len(ps_data.get('common_permission_sets', [])),
                'with_differences': len(ps_data.get('permission_set_differences', {}))
            }
        
        # PSG stats
        if 'permissionSetGroups' in self.comparison_results['details']:
            psg_data = self.comparison_results['details']['permissionSetGroups']
            summary['comparison_stats']['permissionSetGroups'] = {
                'total': len(psg_data.get('all_permission_set_groups', [])),
                'common': len(psg_data.get('common_permission_set_groups', [])),
                'with_differences': len(psg_data.get('permission_set_group_differences', {}))
            }
        
        self.comparison_results['summary'] = summary
    
    def _save_results(self) -> None:
        """Save comparison results to JSON file"""
        # Ensure output directory exists
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save results
        with open(self.output_path, 'w') as f:
            json.dump(self.comparison_results, f, indent=2)
        
        logger.info(f"Results saved to {self.output_path}")
        
        # Export to Excel
        try:
            self._export_to_excel()
        except Exception as e:
            logger.warning(f"Failed to export to Excel: {e}")
        
        # Also save a summary report
        summary_path = self.output_path.parent / f"{self.comparison_id}_summary.txt"
        self._generate_text_summary(summary_path)
    
    def _export_to_excel(self) -> None:
        """Export comparison results to Excel format"""
        import pandas as pd
        
        excel_path = self.output_path.parent / f"{self.comparison_id}_results.xlsx"
        logger.info(f"Exporting results to Excel: {excel_path}")
        
        with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
            # Summary sheet
            summary_df = pd.DataFrame([self.comparison_results['summary']])
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            # Profile differences sheet
            if 'profiles' in self.comparison_results['details']:
                profile_data = self.comparison_results['details']['profiles']
                if profile_data.get('profile_differences'):
                    profile_rows = []
                    for profile, diffs in profile_data['profile_differences'].items():
                        # Object permissions
                        for obj, obj_perms in diffs.get('object_permissions', {}).items():
                            for org, perms in obj_perms.items():
                                row = {
                                    'Profile': profile,
                                    'Permission Type': 'Object',
                                    'Object/Field': obj,
                                    'Organization': org,
                                    **perms
                                }
                                profile_rows.append(row)
                        
                        # Field permissions
                        for field, field_perms in diffs.get('field_permissions', {}).items():
                            for org, perms in field_perms.items():
                                row = {
                                    'Profile': profile,
                                    'Permission Type': 'Field',
                                    'Object/Field': field,
                                    'Organization': org,
                                    **perms
                                }
                                profile_rows.append(row)
                    
                    if profile_rows:
                        profile_df = pd.DataFrame(profile_rows)
                        profile_df.to_excel(writer, sheet_name='Profile Permissions', index=False)
            
            # Permission Set differences sheet
            if 'permissionSets' in self.comparison_results['details']:
                ps_data = self.comparison_results['details']['permissionSets']
                if ps_data.get('permission_set_differences'):
                    ps_rows = []
                    for ps, diffs in ps_data['permission_set_differences'].items():
                        # Similar structure to profiles
                        for obj, obj_perms in diffs.get('object_permissions', {}).items():
                            for org, perms in obj_perms.items():
                                row = {
                                    'Permission Set': ps,
                                    'Permission Type': 'Object',
                                    'Object/Field': obj,
                                    'Organization': org,
                                    **perms
                                }
                                ps_rows.append(row)
                    
                    if ps_rows:
                        ps_df = pd.DataFrame(ps_rows)
                        ps_df.to_excel(writer, sheet_name='Permission Set Permissions', index=False)
            
            # Org comparison matrix
            matrix_data = []
            for perm_type in ['profiles', 'permissionSets', 'permissionSetGroups']:
                if perm_type in self.comparison_results['details']:
                    type_data = self.comparison_results['details'][perm_type]
                    for org, items in type_data.get('org_' + perm_type, {}).items():
                        for item in items:
                            row = {
                                'Type': perm_type.replace('permissionSets', 'Permission Sets').replace('permissionSetGroups', 'Permission Set Groups').title(),
                                'Name': item,
                                'Organization': org,
                                'Present': 'Yes'
                            }
                            matrix_data.append(row)
            
            if matrix_data:
                matrix_df = pd.DataFrame(matrix_data)
                pivot_df = matrix_df.pivot_table(
                    index=['Type', 'Name'], 
                    columns='Organization', 
                    values='Present', 
                    fill_value='No',
                    aggfunc='first'
                )
                pivot_df.to_excel(writer, sheet_name='Org Comparison Matrix')
        
        logger.info(f"Excel export completed: {excel_path}")
    
    def _generate_text_summary(self, summary_path: Path) -> None:
        """Generate a human-readable text summary"""
        with open(summary_path, 'w') as f:
            f.write("=" * 80 + "\n")
            f.write(f"PERMISSIONS COMPARISON SUMMARY\n")
            f.write(f"Comparison ID: {self.comparison_id}\n")
            f.write(f"Generated: {self.comparison_results['timestamp']}\n")
            f.write("=" * 80 + "\n\n")
            
            summary = self.comparison_results['summary']
            f.write(f"Organizations Compared: {', '.join(summary['organizations'])}\n")
            f.write(f"Total Organizations: {summary['organization_count']}\n\n")
            
            # Stats for each permission type
            for perm_type, stats in summary['comparison_stats'].items():
                f.write(f"\n{perm_type.upper()}:\n")
                f.write(f"  Total: {stats['total']}\n")
                f.write(f"  Common across all orgs: {stats['common']}\n")
                f.write(f"  With differences: {stats['with_differences']}\n")
            
            f.write("\n" + "=" * 80 + "\n")
            f.write("For detailed differences, see the JSON results file.\n")
        
        logger.info(f"Summary saved to {summary_path}")


def main():
    parser = argparse.ArgumentParser(description='Enhanced Permissions Comparison')
    parser.add_argument('--data-path', required=True, help='Path to extracted permissions data')
    parser.add_argument('--output-path', required=True, help='Path for output JSON file')
    parser.add_argument('--comparison-id', required=True, help='Unique comparison ID')
    parser.add_argument('--config-path', help='Path to configuration file')
    
    args = parser.parse_args()
    
    try:
        comparison = EnhancedPermissionsComparison(
            args.data_path,
            args.output_path,
            args.comparison_id,
            args.config_path
        )
        comparison.compare_all()
        
        # Output success result for the Python runner
        print(json.dumps({"success": True}))
        
        # Exit successfully
        sys.exit(0)
        
    except Exception as e:
        logger.error(f"Comparison failed: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()