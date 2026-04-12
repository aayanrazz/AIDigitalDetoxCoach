import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUserFindOne: any = jest.fn();
const mockUserCreate: any = jest.fn();
const mockSettingsCreate: any = jest.fn();
const mockSettingsFindOne: any = jest.fn();
const mockNotificationCreate: any = jest.fn();
const mockHash: any = jest.fn();
const mockCompare: any = jest.fn();

jest.unstable_mockModule('../../src/models/User.js', () => ({
  default: {
    findOne: mockUserFindOne,
    create: mockUserCreate
  }
}));

jest.unstable_mockModule('../../src/models/UserSettings.js', () => ({
  default: {
    create: mockSettingsCreate,
    findOne: mockSettingsFindOne
  }
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {
    create: mockNotificationCreate
  }
}));

jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    hash: mockHash,
    compare: mockCompare
  },
  hash: mockHash,
  compare: mockCompare
}));

jest.unstable_mockModule('../../src/utils/jwt.js', () => ({
  generateToken: jest.fn(() => 'jwt-token')
}));

jest.unstable_mockModule('../../src/utils/serialize.js', () => ({
  serializeUser: jest.fn((user: any) => ({
    _id: user._id,
    id: user._id,
    name: user.name,
    email: user.email
  }))
}));

const { register, login, getMe } = await import('../../src/controllers/auth.controller.js');

type MockResponse = {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  json: (payload: any) => MockResponse;
};

type ApiErrorLike = {
  message: string;
  statusCode: number;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    }
  };
}

function getNextError(next: any): ApiErrorLike {
  return next.mock.calls[0][0] as ApiErrorLike;
}

describe('Module 1 - auth.controller.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_AUTH_CTRL_001 - register rejects when required fields are missing', async () => {
    const req = { body: {} } as any;
    const res = createMockResponse();
    const next: any = jest.fn();

    await register(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Name, email, and password are required.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_AUTH_CTRL_002 - register rejects when password is shorter than 8 characters', async () => {
    const req = {
      body: {
        name: 'Aayan',
        email: 'aayan@example.com',
        password: '12345'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await register(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Password must be at least 8 characters.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_AUTH_CTRL_003 - register rejects duplicate email', async () => {
    mockUserFindOne.mockImplementationOnce(async () => ({
      _id: 'existing-user-id',
      email: 'aayan@example.com'
    }));

    const req = {
      body: {
        name: 'Aayan',
        email: 'aayan@example.com',
        password: 'password123'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await register(req, res as any, next);

    expect(mockUserFindOne).toHaveBeenCalledWith({
      email: 'aayan@example.com'
    });

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Email already exists.');
    expect(error.statusCode).toBe(409);
  });

  it('TC_AUTH_CTRL_004 - register creates user, settings, notification, and returns token', async () => {
    mockUserFindOne.mockImplementationOnce(async () => null);
    mockHash.mockImplementationOnce(async () => 'hashed-password');

    mockUserCreate.mockImplementationOnce(async () => ({
      _id: 'user-001',
      name: 'Aayan',
      email: 'aayan@example.com'
    }));

    mockSettingsCreate.mockImplementationOnce(async () => ({
      _id: 'settings-001',
      user: 'user-001'
    }));

    mockNotificationCreate.mockImplementationOnce(async () => ({
      _id: 'notification-001'
    }));

    const req = {
      body: {
        name: '  Aayan  ',
        email: '  AAYAN@example.com  ',
        password: 'password123'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await register(req, res as any, next);

    expect(mockUserFindOne).toHaveBeenCalledWith({
      email: 'aayan@example.com'
    });

    expect(mockHash).toHaveBeenCalledWith('password123', 10);

    expect(mockUserCreate).toHaveBeenCalledWith({
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password'
    });

    expect(mockSettingsCreate).toHaveBeenCalledWith({
      user: 'user-001'
    });

    expect(mockNotificationCreate).toHaveBeenCalledWith({
      user: 'user-001',
      type: 'system',
      title: 'Welcome to Digital Detox Coach',
      body: 'Complete your profile setup to generate your first detox plan.',
      cta: {
        label: 'SET GOALS',
        action: 'open_profile_setup'
      }
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: 'Account created successfully.',
      token: 'jwt-token',
      user: {
        _id: 'user-001',
        id: 'user-001',
        name: 'Aayan',
        email: 'aayan@example.com'
      },
      settings: {
        _id: 'settings-001',
        user: 'user-001'
      }
    });
  });

  it('TC_AUTH_CTRL_005 - login rejects when email or password is missing', async () => {
    const req = { body: {} } as any;
    const res = createMockResponse();
    const next: any = jest.fn();

    await login(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Email and password are required.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_AUTH_CTRL_006 - login rejects when user is not found', async () => {
    const mockSelect: any = jest.fn();
    mockSelect.mockImplementationOnce(async () => null);

    mockUserFindOne.mockImplementationOnce(() => ({
      select: mockSelect
    }));

    const req = {
      body: {
        email: 'unknown@example.com',
        password: 'password123'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await login(req, res as any, next);

    expect(mockUserFindOne).toHaveBeenCalledWith({
      email: 'unknown@example.com'
    });
    expect(mockSelect).toHaveBeenCalledWith('+passwordHash');

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Invalid email or password.');
    expect(error.statusCode).toBe(401);
  });

  it('TC_AUTH_CTRL_007 - login rejects when password does not match', async () => {
    const mockSave: any = jest.fn();

    const mockUser = {
      _id: 'user-001',
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password',
      save: mockSave
    };

    const mockSelect: any = jest.fn();
    mockSelect.mockImplementationOnce(async () => mockUser);

    mockUserFindOne.mockImplementationOnce(() => ({
      select: mockSelect
    }));

    mockCompare.mockImplementationOnce(async () => false);

    const req = {
      body: {
        email: 'aayan@example.com',
        password: 'wrong-password'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await login(req, res as any, next);

    expect(mockCompare).toHaveBeenCalledWith('wrong-password', 'hashed-password');
    expect(mockSave).not.toHaveBeenCalled();

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Invalid email or password.');
    expect(error.statusCode).toBe(401);
  });

  it('TC_AUTH_CTRL_008 - login succeeds, updates lastLoginAt, and returns token with settings', async () => {
    const mockSave: any = jest.fn();
    mockSave.mockImplementationOnce(async () => true);

    const mockUser = {
      _id: 'user-001',
      name: 'Aayan',
      email: 'aayan@example.com',
      passwordHash: 'hashed-password',
      save: mockSave,
      lastLoginAt: null as Date | null
    };

    const mockSelect: any = jest.fn();
    mockSelect.mockImplementationOnce(async () => mockUser);

    mockUserFindOne.mockImplementationOnce(() => ({
      select: mockSelect
    }));

    mockCompare.mockImplementationOnce(async () => true);

    mockSettingsFindOne.mockImplementationOnce(async () => ({
      _id: 'settings-001',
      user: 'user-001',
      dailyLimitMinutes: 180
    }));

    const req = {
      body: {
        email: '  AAYAN@example.com  ',
        password: 'password123'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await login(req, res as any, next);

    expect(mockUserFindOne).toHaveBeenCalledWith({
      email: 'aayan@example.com'
    });
    expect(mockCompare).toHaveBeenCalledWith('password123', 'hashed-password');
    expect(mockSettingsFindOne).toHaveBeenCalledWith({
      user: 'user-001'
    });
    expect(mockUser.lastLoginAt).toBeInstanceOf(Date);
    expect(mockSave).toHaveBeenCalled();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Login successful.',
      token: 'jwt-token',
      user: {
        _id: 'user-001',
        id: 'user-001',
        name: 'Aayan',
        email: 'aayan@example.com'
      },
      settings: {
        _id: 'settings-001',
        user: 'user-001',
        dailyLimitMinutes: 180
      }
    });
  });

  it('TC_AUTH_CTRL_009 - getMe returns current authenticated user with settings', async () => {
    mockSettingsFindOne.mockImplementationOnce(async () => ({
      _id: 'settings-001',
      user: 'user-001',
      dailyLimitMinutes: 180
    }));

    const req = {
      user: {
        _id: 'user-001',
        name: 'Aayan',
        email: 'aayan@example.com'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await getMe(req, res as any, next);

    expect(mockSettingsFindOne).toHaveBeenCalledWith({
      user: 'user-001'
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      user: {
        _id: 'user-001',
        id: 'user-001',
        name: 'Aayan',
        email: 'aayan@example.com'
      },
      settings: {
        _id: 'settings-001',
        user: 'user-001',
        dailyLimitMinutes: 180
      }
    });
  });
});