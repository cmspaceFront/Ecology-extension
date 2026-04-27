/** @jsx jsx */
import { jsx } from 'jimu-core';
import { AllWidgetSettingProps } from 'jimu-for-builder';
import {
  SettingSection,
  SettingRow,
  LinkSelector
} from "jimu-ui/advanced/setting-components";
import { IMConfig } from '../config';

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const { config, id, onSettingChange } = props;

  const handleLinkChange = (linkParam: any) => {
    onSettingChange({
      id,
      config: config.set('linkParam', linkParam)
    });
  };

  return (
    <div className="widget-setting-space-eco-header" style={{ padding: '20px' }}>
      <SettingSection title="Logo Navigation Settings">
        <SettingRow label="Logo Click Action">
          <LinkSelector
            onSettingConfirm={handleLinkChange}
            linkParam={config.linkParam}
            widgetId={id}
          />
        </SettingRow>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
          Configure where clicking the logo navigates to
        </div>
      </SettingSection>
    </div>
  );
};

export default Setting;