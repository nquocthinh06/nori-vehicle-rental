import { AI_TOOL_DEFINITIONS, validateToolArguments } from './schemas.ts'
import {
  toolCalculateRentalPrice,
  toolCheckAvailability,
  toolCompareVehicles,
  toolGetActivePromotions,
  toolGetCustomerBookingStatus,
  toolGetPurchaseConsultationInfo,
  toolGetRentalPolicy,
  toolGetVehicleDetails,
  toolPrepareBooking,
  toolRecommendVehicles,
  toolSearchVehicles,
  type AIToolExecutionContext,
  type AIToolExecutionResult,
} from './tools.ts'
import { ALLOWED_TOOL_NAMES, type AIToolDefinition, type AllowedToolName } from './types.ts'

const ALLOWLIST_SET = new Set<string>(ALLOWED_TOOL_NAMES)

export function isAllowedToolName(name: string): name is AllowedToolName {
  return ALLOWLIST_SET.has(name)
}

export function getAllowedToolDefinitions(): AIToolDefinition[] {
  return AI_TOOL_DEFINITIONS
}

/**
 * Controlled Allowlist Function Calling Dispatcher.
 * 1) Strictly rejects any tool name outside ALLOWED_TOOL_NAMES.
 * 2) Safely parses JSON arguments.
 * 3) Validates & allowlists all arguments via schemas.ts before touching Payload or business rules.
 */
export async function executeAllowedTool(
  ctx: AIToolExecutionContext,
  rawName: string,
  argumentsJson: string,
): Promise<{
  ok: boolean
  toolName: string
  result: AIToolExecutionResult
}> {
  if (!isAllowedToolName(rawName)) {
    return {
      ok: false,
      toolName: rawName,
      result: {
        toolOutputForLLM: {
          error: 'Công cụ yêu cầu không nằm trong danh sách được phép của NORI.',
        },
      },
    }
  }

  let parsedArgs: unknown
  try {
    parsedArgs = argumentsJson && argumentsJson.trim() ? JSON.parse(argumentsJson) : {}
  } catch {
    return {
      ok: false,
      toolName: rawName,
      result: {
        toolOutputForLLM: {
          error: 'Tham số gọi hàm không đúng định dạng JSON hợp lệ.',
        },
      },
    }
  }

  const validation = validateToolArguments(rawName, parsedArgs)
  if (!validation.ok) {
    return {
      ok: false,
      toolName: rawName,
      result: {
        toolOutputForLLM: {
          error: validation.error,
        },
      },
    }
  }

  switch (rawName) {
    case 'searchVehicles':
      return {
        ok: true,
        toolName: rawName,
        result: await toolSearchVehicles(ctx, validation.data as never),
      }
    case 'getVehicleDetails':
      return {
        ok: true,
        toolName: rawName,
        result: await toolGetVehicleDetails(ctx, validation.data as never),
      }
    case 'checkAvailability':
      return {
        ok: true,
        toolName: rawName,
        result: await toolCheckAvailability(ctx, validation.data as never),
      }
    case 'calculateRentalPrice':
      return {
        ok: true,
        toolName: rawName,
        result: await toolCalculateRentalPrice(ctx, validation.data as never),
      }
    case 'getActivePromotions':
      return {
        ok: true,
        toolName: rawName,
        result: await toolGetActivePromotions(ctx, validation.data as never),
      }
    case 'compareVehicles':
      return {
        ok: true,
        toolName: rawName,
        result: await toolCompareVehicles(ctx, validation.data as never),
      }
    case 'getRentalPolicy':
      return {
        ok: true,
        toolName: rawName,
        result: await toolGetRentalPolicy(ctx, validation.data as never),
      }
    case 'recommendVehicles':
      return {
        ok: true,
        toolName: rawName,
        result: await toolRecommendVehicles(ctx, validation.data as never),
      }
    case 'prepareBooking':
      return {
        ok: true,
        toolName: rawName,
        result: await toolPrepareBooking(ctx, validation.data as never),
      }
    case 'getCustomerBookingStatus':
      return {
        ok: true,
        toolName: rawName,
        result: await toolGetCustomerBookingStatus(ctx, validation.data as never),
      }
    case 'getPurchaseConsultationInfo':
      return {
        ok: true,
        toolName: rawName,
        result: await toolGetPurchaseConsultationInfo(ctx, validation.data as never),
      }
  }
}
