/** @jsx jsx */
import {
  React,
  jsx
} from "jimu-core";
import { AllWidgetSettingProps } from "jimu-for-builder";
import { SettingSection, SettingRow } from "jimu-ui/advanced/setting-components";
import { NumericInput } from "jimu-ui";
import { IMConfig } from "../config";

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const { config, id, onSettingChange } = props;

  const handleConfigChange = (key: keyof IMConfig, value: any) => {
    onSettingChange({
      id,
      config: {
        ...config,
        [key]: value
      }
    });
  };

  return (
    <div className="widget-setting-status-statistics">
      <SettingSection title="Status Values (mock data from Figma design)">
        <SettingRow label="Tekshirilgan (Checked) count">
          <NumericInput
            min={0}
            value={config.checkedCount ?? 1600}
            onChange={(value) => handleConfigChange("checkedCount", value)}
          />
        </SettingRow>
        <SettingRow label="Tadiqlangan (Approved) count">
          <NumericInput
            min={0}
            value={config.approvedCount ?? 1000}
            onChange={(value) => handleConfigChange("approvedCount", value)}
          />
        </SettingRow>
        <SettingRow label="Tasdiqlanmagan (Rejected) count">
          <NumericInput
            min={0}
            value={config.rejectedCount ?? 600}
            onChange={(value) => handleConfigChange("rejectedCount", value)}
          />
        </SettingRow>
        <SettingRow label="Jarayonda (In progress) count">
          <NumericInput
            min={0}
            value={config.inProgressCount ?? 400}
            onChange={(value) => handleConfigChange("inProgressCount", value)}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default Setting;


