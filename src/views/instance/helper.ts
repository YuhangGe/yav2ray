import { invoke } from '@tauri-apps/api/core';
import { globalStore } from '@/store/global';
import configTpl from '@/assets/v2ray.conf.template.json?raw';
import {
  CreateCommand,
  DescribeCommands,
  DescribeInstances,
  InvokeCommand,
  ModifyCommand,
  type CVMInstance,
} from '@/service/tencent';
import { renderTpl } from '@/service/util';
import { appendLog } from '@/store/log';
import { getInstanceAgentShell } from '@/service/instance';

export async function loadInstance(id?: string) {
  return await DescribeInstances({
    Limit: 1,
    Offset: 0,
    ...(id
      ? { InstanceIds: [id] }
      : {
          Filters: [
            {
              Name: 'instance-name',
              Values: [globalStore.get('settings').resourceName],
            },
          ],
        }),
  });
}

export async function waitInstanceReady(inst: CVMInstance) {
  while (inst.InstanceState !== 'RUNNING' || !inst.PublicIpAddresses?.[0]) {
    await new Promise((res) => setTimeout(res, 2000));
    const [err, res] = await loadInstance(inst.InstanceId);
    if (!err && res.InstanceSet.length) {
      inst = res.InstanceSet[0];
    }
  }
}

export async function createOrUpdateCommand(shellContent: string) {
  const [e0, r1] = await DescribeCommands({
    Filters: [{ Name: 'command-name', Values: ['v2ray_agent'] }],
  });
  if (e0) return;
  let id = r1.CommandSet[0]?.CommandId;
  if (id) {
    appendLog('[agent] ==> 更新 V2Ray 安装自动化脚本');
    const [err] = await ModifyCommand({
      CommandId: id,
      Content: shellContent,
    });
    if (err) return;
  } else {
    appendLog('[agent] ==> 创建 V2Ray 安装自动化脚本');
    const [err, res] = await CreateCommand({
      CommandName: 'v2ray_agent',
      WorkingDirectory: '/home/ubuntu',
      Username: 'ubuntu',
      Timeout: 600,
      Content: shellContent,
    });
    if (err) return;
    id = res.CommandId;
  }
  return id;
}

export async function installV2RayAgent(inst: CVMInstance) {
  const shellContent = window.btoa(getInstanceAgentShell());
  const commandId = await createOrUpdateCommand(shellContent);
  if (!commandId) {
    appendLog('[agent] ==> 安装 V2Ray 自动化脚本执行失败');
    return false;
  }
  try {
    await InvokeCommand({
      CommandId: commandId,
      InstanceIds: [inst.InstanceId],
    });
  } catch (ex) {
    console.error(ex);
    appendLog('[agent] ==> 安装 V2Ray 自动化脚本执行失败');
    return false;
  }
  for (let i = 0; i < 150; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    const pinged = await pingV2RayOnce(inst);
    if (pinged) {
      return true;
    }
  }
  return false; // timeout
}

export async function pingV2RayOnce(inst: CVMInstance) {
  const settings = globalStore.get('settings');
  if (!settings.token) return false;
  if (!inst) return false;
  const ip = inst.PublicIpAddresses?.[0];
  if (!ip) return false;
  try {
    const res = await invoke('tauri_ping_v2ray_once', {
      url: `http://${ip}:2081/ping?token=${settings.token}`,
      token: settings.token,
    });
    return res === 'pong!';
  } catch (ex) {
    console.error(ex);
    return false;
  }
}
export async function pingV2RayInterval() {
  const settings = globalStore.get('settings');
  if (!settings.token) return false;
  const inst = globalStore.get('instance');
  if (!inst) return false;
  const ip = inst.PublicIpAddresses?.[0];
  if (!ip) return false;
  try {
    const res = await invoke('tauri_ping_v2ray_interval', {
      url: `http://${ip}:2081/ping?token=${settings.token}`,
      token: settings.token,
    });
    return res === 'pong!';
  } catch (ex) {
    console.error(ex);
    return false;
  }
}

export async function startV2RayCore() {
  const settings = globalStore.get('settings');
  const inst = globalStore.get('instance');
  if (!inst) return false;
  const ip = inst.PublicIpAddresses?.[0];
  if (!ip) return false;
  try {
    await invoke('tauri_start_v2ray_server', {
      config: renderTpl(configTpl, {
        REMOTE_IP: ip,
        TOKEN: settings.token,
      }),
    });
    return true;
  } catch (ex) {
    console.error(ex);
    return false;
  }
}
