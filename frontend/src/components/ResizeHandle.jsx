import React from 'react';
import { Box } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

const ResizeHandle = ({ onMouseDown }) => (
  <Box
    onMouseDown={onMouseDown}
    sx={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: 4,
      height: '100%',
      cursor: 'col-resize',
      zIndex: 10,
      bgcolor: 'transparent',
      transition: 'background-color 0.1s',
      '&:hover': {
        bgcolor: '#4a9eff'
      }
    }}
  >
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#4a9eff',
        opacity: 0.9,
        pointerEvents: 'none'
      }}
    >
      <DragIndicatorIcon sx={{ fontSize: 14 }} />
    </Box>
  </Box>
);

export default ResizeHandle;