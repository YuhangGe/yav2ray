import { App as AntApp, Button, Spin, Tooltip } from 'antd';
import { Suspense, lazy, useEffect, useState, type FC } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { cs, useQuery } from './service/util';
import { globalStore } from './store/global';
import { useLogListen } from './views/logview/listen';
import { appendLog } from './store/log';

import {
  loadInstance,
  pingV2RayInterval,
  pingV2RayOnce,
  startV2RayCore,
} from './views/instance/helper';
import { installStore } from './store/install';
import imgLogo from '@/assets/logo-128x128.png';

const InstanceView = lazy(() => import('./views/instance'));
const SettingsView = lazy(() => import('./views/settings'));
const OverviewView = lazy(() => import('./views/overview'));
const LogView = lazy(() => import('./views/logview'));

const ViewItems = [
  {
    label: '概览',
    icon: <span className='icon-[material-symbols--overview-key-outline]'></span>,
    key: 'overview',
  },
  {
    label: '主机',
    icon: <span className='icon-[ant-design--cloud-server-outlined]'></span>,
    key: 'instance',
  },
  {
    label: '设置',
    icon: <span className='icon-[ant-design--setting-outlined]'></span>,
    key: 'settings',
  },
  {
    label: '日志',
    icon: <span className='icon-[tabler--logs]'></span>,
    key: 'logs',
  },
];

export const Layout: FC = () => {
  const { message } = AntApp.useApp();
  const [settings] = globalStore.useStore('settings');
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useQuery(
    'view',
    settings.secretKey && settings.instanceType ? 'overview' : 'settings',
  );

  useLogListen();

  const initialize = async () => {
    const [err, res] = await loadInstance();
    if (err || !res.InstanceSet.length) return;
    const inst = res.InstanceSet[0];
    globalStore.set('instance', inst);
    if (!(await pingV2RayOnce(inst))) {
      return;
    }
    installStore.set('installed', true);
    appendLog('[ping] ==> 开始定时 Ping 服务');
    void pingV2RayInterval();
    void startV2RayCore();
  };
  useEffect(() => {
    const settings = globalStore.get('settings');
    if (!settings.secretKey || !settings.instanceType) {
      setLoaded(true);
      return;
    }
    void initialize()
      .catch((ex) => {
        void message.error(`${ex}`);
      })
      .finally(() => {
        if (!globalStore.get('instance') || !installStore.get('installed')) {
          setView('instance');
        }
        setLoaded(true);
      });
  }, []);

  return loaded ? (
    <>
      <div className='flex w-28 flex-shrink-0 flex-col border-r border-solid border-border'>
        <div className='pl-5 pt-[5px]'>
          <img src={imgLogo} className='size-16' />
        </div>
        {ViewItems.map((item) => (
          <div
            key={item.key}
            onClick={() => {
              if (!settings.secretKey) {
                void message.error('请先配置密钥参数');
                return;
              }
              if (!settings.instanceType) {
                void message.error('请先配置主机参数');
                return;
              }
              setView(item.key);
            }}
            className={cs(
              'flex w-full cursor-pointer items-center py-5 pl-5 text-lg hover:bg-hover hover:text-white',
              view === item.key && 'text-blue',
            )}
          >
            {item.icon}
            <span className='ml-2'>{item.label}</span>
          </div>
        ))}
        <div className='flex-1'></div>
        <Tooltip title='退出 CloudV2Ray，结束本地代理'>
          <Button
            onClick={() => {
              void invoke('tauri_exit_process');
            }}
            className='flex items-center justify-center pb-4 pt-2'
            style={{ width: '100%' }}
            icon={<span className='icon-[grommet-icons--power-shutdown]'></span>}
            type='link'
            danger
          />
        </Tooltip>
      </div>
      {view === 'overview' && (
        <Suspense>
          <OverviewView />
        </Suspense>
      )}
      {view === 'instance' && (
        <Suspense>
          <InstanceView />
        </Suspense>
      )}
      {view === 'settings' && (
        <Suspense>
          <SettingsView />
        </Suspense>
      )}
      {view === 'logs' && (
        <Suspense>
          <LogView />
        </Suspense>
      )}
    </>
  ) : (
    <div className='flex w-full items-center justify-center'>
      <Spin />
    </div>
  );
};
