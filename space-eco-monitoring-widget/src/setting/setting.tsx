/** @jsx jsx */
import { jsx } from 'jimu-core';
import { AllWidgetSettingProps } from 'jimu-for-builder';
import {
  SettingSection,
  SettingRow,
  LinkSelector,
  type IMLinkParam
} from "jimu-ui/advanced/setting-components";
import {
  Input,
  NumericInput
} from "jimu-ui";
import { ImageSelector } from 'jimu-ui/advanced/resource-selector';
import { type ImageResourceItemInfo } from 'jimu-for-builder';
import { IMConfig } from '../config';

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const { config, id, onSettingChange } = props;

  const handleConfigChange = (key: string, value: any) => {
    onSettingChange({
      id,
      config: config.set(key, value)
    });
  };

  const handleImageChange = (imageParam: ImageResourceItemInfo) => {
    const imageUrl = (imageParam as any)?.originalUrl || (imageParam as any)?.url || config.logoUrl || '';
    onSettingChange({
      id,
      config: config.set('logoImageParam', imageParam).set('logoUrl', imageUrl)
    });
  };

  return (
    <div className="widget-setting-space-eco-monitoring" style={{ padding: '20px' }}>
      <SettingSection title="Logo Settings">
        <SettingRow label="Logo Image" flow="wrap">
          <div className="d-flex align-items-center w-100">
            <div style={{ minWidth: '60px' }}>
              <ImageSelector
                buttonClassName="text-dark d-flex justify-content-center btn-browse"
                widgetId={id}
                buttonLabel="Set Logo"
                buttonSize="sm"
                onChange={handleImageChange}
                imageParam={config.logoImageParam}
              />
            </div>
            <div
              style={{ width: '70px', marginLeft: '8px' }}
              className="uploadFileName"
              title={config.logoImageParam?.originalName || 'No image selected'}
            >
              {config.logoImageParam?.originalName || 'No image'}
            </div>
          </div>
        </SettingRow>
        <SettingRow label="Or Logo URL">
          <Input
            type="text"
            placeholder="Enter logo image URL (alternative)"
            value={config.logoUrl || ""}
            onChange={(e) => handleConfigChange("logoUrl", e.target.value)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="3D Earth Settings">
        <SettingRow label="Размер Земли (Earth Scale)">
          <NumericInput
            min={0.5}
            step={0.5}
            value={config.earthScale || 4}
            onChange={(value) => handleConfigChange("earthScale", value || 4)}
            placeholder="4"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Размер Земли (по умолчанию: 4). Минимум: 0.5. Максимального значения нет - можно увеличивать до любого размера.
          </div>
        </SettingRow>
        <SettingRow label="Скорость вращения Земли (Earth Rotation Speed)">
          <NumericInput
            min={0}
            max={10}
            step={0.1}
            value={config.earthRotationSpeed || 0.5}
            onChange={(value) => handleConfigChange("earthRotationSpeed", value || 0.5)}
            placeholder="0.5"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Скорость вращения Земли (по умолчанию: 0.5). Диапазон: 0 - 10. Увеличьте для более быстрого вращения. 0 = без вращения.
          </div>
        </SettingRow>
        <SettingRow label="Скорость вращения атмосферы (Atmosphere Rotation Speed)">
          <NumericInput
            min={0}
            max={10}
            step={0.1}
            value={config.atmosphereRotationSpeed !== undefined ? config.atmosphereRotationSpeed : 0.11}
            onChange={(value) => handleConfigChange("atmosphereRotationSpeed", value !== null && value !== undefined ? value : 0.11)}
            placeholder="0.11"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Скорость вращения атмосферы (по умолчанию: 0.11). Диапазон: 0 - 10. Обычно меньше скорости Земли для красивого эффекта. 0 = без вращения.
          </div>
        </SettingRow>
        <SettingRow label="Earth Vertical Position">
          {/*
            Clamp helper to make sure value never drops below 0 even if typed manually.
          */}
          {(() => {
            const clampPosition = (value?: number | null): number => {
              if (value === null || value === undefined) return 0;
              return Math.max(0, value);
            };
            return (
              <NumericInput
                min={0}
                max={10}
                step={0.5}
                value={clampPosition(config.earthPositionY)}
                onChange={(value) =>
                  handleConfigChange("earthPositionY", clampPosition(value))
                }
                placeholder="0"
              />
            );
          })()}
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Вертикальная позиция Земли (по умолчанию: 0). Значение 0 ставит Землю по центру, большее значение поднимает её выше. Значения ниже 0 недоступны.
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Navigation Settings">
        <SettingRow role="group" aria-label="Set link">
          <LinkSelector
            onSettingConfirm={(linkParam: IMLinkParam) => {
              handleConfigChange("linkParam", linkParam);
            }}
            linkParam={config.linkParam}
            widgetId={id}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};

export default Setting;