import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeSortedLimitResult = (value) => ({
  sort: jest.fn(() => ({
    limit: jest.fn().mockResolvedValue(value),
  })),
});

const loadNotificationController = async ({
  findResult,
  countDocuments,
  findOne,
  updateMany,
} = {}) => {
  const Notification = {
    find: jest.fn(() => makeSortedLimitResult(findResult ?? [])),
    countDocuments: countDocuments ?? jest.fn().mockResolvedValue(0),
    findOne: findOne ?? jest.fn().mockResolvedValue(null),
    updateMany: updateMany ?? jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  };

  jest.unstable_mockModule('../../models/Notification.js', () => ({
    default: Notification,
  }));

  const controller = await import('../notification.controller.js');
  return { ...controller, mocks: { Notification } };
};

describe('Module 12 - notification.controller', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_ENGAGE_001 getNotifications returns unread count and normalizes CTA actions', async () => {
    const items = [
      {
        _id: 'notif-1',
        title: 'Wind down time',
        body: 'Put the phone away',
        type: 'sleep',
        isRead: false,
        cta: { label: '', action: 'wind_down' },
        toObject() {
          return {
            _id: 'notif-1',
            title: 'Wind down time',
            body: 'Put the phone away',
            type: 'sleep',
            isRead: false,
            cta: { label: '', action: 'wind_down' },
          };
        },
      },
      {
        _id: 'notif-2',
        title: 'Reward redeemed',
        body: 'Check rewards',
        type: 'achievement',
        isRead: true,
        cta: { label: 'See rewards', action: 'open_rewards' },
      },
    ];

    const { getNotifications, mocks } = await loadNotificationController({
      findResult: items,
      countDocuments: jest.fn().mockResolvedValue(1),
    });

    const req = { user: { _id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    await getNotifications(req, res, next);

    expect(mocks.Notification.find).toHaveBeenCalledWith({ user: 'user-1' });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      unreadCount: 1,
      notifications: [
        expect.objectContaining({
          _id: 'notif-1',
          cta: { label: 'OPEN SETTINGS', action: 'open_settings' },
        }),
        expect.objectContaining({
          _id: 'notif-2',
          cta: { label: 'See rewards', action: 'open_rewards' },
        }),
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_ENGAGE_002 markNotificationRead updates one notification and returns refreshed unread count', async () => {
    const notification = {
      _id: 'notif-1',
      user: 'user-1',
      title: 'Daily summary',
      body: 'Review your usage',
      type: 'summary',
      isRead: false,
      cta: { label: '', action: 'open_home' },
      save: jest.fn().mockResolvedValue(undefined),
      toObject() {
        return {
          _id: 'notif-1',
          title: 'Daily summary',
          body: 'Review your usage',
          type: 'summary',
          isRead: true,
          cta: { label: '', action: 'open_home' },
        };
      },
    };

    const { markNotificationRead, mocks } = await loadNotificationController({
      findOne: jest.fn().mockResolvedValue(notification),
      countDocuments: jest.fn().mockResolvedValue(3),
    });

    const req = { user: { _id: 'user-1' }, params: { id: 'notif-1' } };
    const res = makeRes();
    const next = jest.fn();

    await markNotificationRead(req, res, next);

    expect(notification.isRead).toBe(true);
    expect(notification.save).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Notification marked as read.',
      unreadCount: 3,
      notification: {
        _id: 'notif-1',
        title: 'Daily summary',
        body: 'Review your usage',
        type: 'summary',
        isRead: true,
        cta: { label: 'GO HOME', action: 'open_home' },
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_ENGAGE_003 markAllNotificationsRead marks all unread items as read', async () => {
    const { markAllNotificationsRead, mocks } = await loadNotificationController({
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 4 }),
    });

    const req = { user: { _id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    await markAllNotificationsRead(req, res, next);

    expect(mocks.Notification.updateMany).toHaveBeenCalledWith(
      { user: 'user-1', isRead: false },
      { $set: { isRead: true } }
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'All notifications marked as read.',
      unreadCount: 0,
    });
    expect(next).not.toHaveBeenCalled();
  });
});