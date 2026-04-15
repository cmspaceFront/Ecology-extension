/** @jsx jsx */
import {
  React,
  jsx
} from "jimu-core";
import { AllWidgetSettingProps } from "jimu-for-builder";
import {
  SettingSection,
  SettingRow
} from "jimu-ui/advanced/setting-components";
import {
  Label,
  Input,
  NumericInput,
  Switch
} from "jimu-ui";
import { IMConfig } from "../config";

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const { config, id, onSettingChange } = props;

  const handleConfigChange = (key: string, value: any) => {
    onSettingChange({
      id,
      config: {
        ...config,
        [key]: value
      }
    });
  };

  return (
    <div className="widget-setting-statistics-dashboard">
      <SettingSection title="API Configuration">
        <SettingRow label="Use API Data">
          <Switch
            checked={config.useApiData || false}
            onChange={(e) => handleConfigChange("useApiData", e.target.checked)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Statistics Values">
        <SettingRow label="Detected Objects Count">
          <NumericInput
            min={0}
            value={config.detectedCount || 2226}
            onChange={(value) => handleConfigChange("detectedCount", value)}
          />
        </SettingRow>
        <SettingRow label="Detected Objects Area (hectares)">
          <NumericInput
            min={0}
            step={0.01}
            value={config.detectedArea || 400.33}
            onChange={(value) => handleConfigChange("detectedArea", value)}
          />
        </SettingRow>
        <SettingRow label="Checked Objects Count">
          <NumericInput
            min={0}
            value={config.checkedCount || 1800}
            onChange={(value) => handleConfigChange("checkedCount", value)}
          />
        </SettingRow>
        <SettingRow label="In Progress Count">
          <NumericInput
            min={0}
            value={config.inProgressCount || 426}
            onChange={(value) => handleConfigChange("inProgressCount", value)}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default Setting;

